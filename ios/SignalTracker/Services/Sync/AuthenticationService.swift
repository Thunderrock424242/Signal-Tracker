import Foundation
import Combine
import Security
import AuthenticationServices
import CryptoKit
import UIKit
import SignalTrackerCore
@MainActor
final class AuthenticationService:NSObject,ObservableObject,ASWebAuthenticationPresentationContextProviding {
    struct Credential:Codable {let token:String;let expiresAt:Date;let issuer:String;let clientID:String}
    @Published private(set) var signedIn=false
    private var webSession:ASWebAuthenticationSession?
    private func random()->String {var bytes=[UInt8](repeating:0,count:32);precondition(SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes)==errSecSuccess);return Data(bytes).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")}
    func accessToken(settings:FieldSettings) throws ->String {guard let data=KeychainStore.read("oidc"),let c=try? JSONCoding.decoder().decode(Credential.self,from:data),c.expiresAt>Date(),c.issuer==settings.issuer,c.clientID==settings.clientID else{signedIn=false;throw DataError.invalid("Sign in to synchronize. Local use needs no account.")};signedIn=true;return c.token}
    func signOut() {KeychainStore.delete("oidc");signedIn=false}
    func signIn(settings:FieldSettings) async throws {
        guard let issuer=URL(string:settings.issuer),issuer.scheme=="https",!settings.clientID.isEmpty else{throw DataError.invalid("Configure your HTTPS OIDC issuer and public client ID first.")}
        let (data,response)=try await URLSession.shared.data(from:issuer.appendingPathComponent(".well-known/openid-configuration"));guard (response as? HTTPURLResponse)?.statusCode==200,data.count<128_000,let discovery=try JSONSerialization.jsonObject(with:data) as? [String:Any],discovery["issuer"] as? String==settings.issuer,let auth=discovery["authorization_endpoint"] as? String,let tokenURL=discovery["token_endpoint"] as? String,URL(string:auth)?.scheme=="https",URL(string:tokenURL)?.scheme=="https" else{throw DataError.invalid("Invalid OIDC discovery document")}
        let verifier=random(),state=random(),challenge=Data(SHA256.hash(data:Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:""),redirect="signaltracker://oauth/callback"
        var url=URLComponents(string:auth)!;url.queryItems=[.init(name:"client_id",value:settings.clientID),.init(name:"redirect_uri",value:redirect),.init(name:"response_type",value:"code"),.init(name:"scope",value:"openid"),.init(name:"state",value:state),.init(name:"code_challenge",value:challenge),.init(name:"code_challenge_method",value:"S256"),.init(name:"audience",value:settings.audience)]
        let callback:URL=try await withCheckedThrowingContinuation {continuation in self.webSession=ASWebAuthenticationSession(url:url.url!,callbackURLScheme:"signaltracker") {url,error in if let url {continuation.resume(returning:url)}else{continuation.resume(throwing:error ?? DataError.invalid("Sign in cancelled"))}};self.webSession?.presentationContextProvider=self;self.webSession?.prefersEphemeralWebBrowserSession=true;if self.webSession?.start() != true {continuation.resume(throwing:DataError.invalid("Unable to open sign in"))}}
        defer {webSession=nil};let parts=URLComponents(url:callback,resolvingAgainstBaseURL:false)?.queryItems ?? [];guard callback.host=="oauth",callback.path=="/callback",parts.first(where:{$0.name=="state"})?.value==state,let code=parts.first(where:{$0.name=="code"})?.value else{throw DataError.invalid("Invalid authorization callback")}
        let allowed=CharacterSet.alphanumerics.union(CharacterSet(charactersIn:"-._~"));let fields=["grant_type":"authorization_code","client_id":settings.clientID,"redirect_uri":redirect,"code":code,"code_verifier":verifier];let body=fields.map {$0.key+"="+$0.value.addingPercentEncoding(withAllowedCharacters:allowed)!}.joined(separator:"&")
        var request=URLRequest(url:URL(string:tokenURL)!);request.httpMethod="POST";request.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type");request.httpBody=Data(body.utf8);request.timeoutInterval=15
        let (tokens,r)=try await URLSession.shared.data(for:request);guard (r as? HTTPURLResponse)?.statusCode==200,tokens.count<64000,let result=try JSONSerialization.jsonObject(with:tokens) as? [String:Any],let access=result["access_token"] as? String,let expires=result["expires_in"] as? Double,expires>0,access.count<=16000 else{throw DataError.invalid("The provider did not issue a usable API access token")}
        let c=Credential(token:access,expiresAt:Date().addingTimeInterval(expires),issuer:settings.issuer,clientID:settings.clientID);try KeychainStore.save(JSONCoding.encoder().encode(c),account:"oidc");signedIn=true
    }
    func presentationAnchor(for session:ASWebAuthenticationSession)->ASPresentationAnchor {UIApplication.shared.connectedScenes.compactMap {$0 as? UIWindowScene}.flatMap(\.windows).first(where:\.isKeyWindow) ?? ASPresentationAnchor()}
}
