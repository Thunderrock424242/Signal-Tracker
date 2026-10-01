import Foundation
import Security
enum KeychainStore {
    static func read(_ account:String)->Data? {let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.thunder.SignalTracker",kSecAttrAccount as String:account,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne];var result:CFTypeRef?;guard SecItemCopyMatching(q as CFDictionary,&result)==errSecSuccess else{return nil};return result as? Data}
    static func save(_ data:Data,account:String) throws {delete(account);let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.thunder.SignalTracker",kSecAttrAccount as String:account,kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleWhenUnlockedThisDeviceOnly];guard SecItemAdd(q as CFDictionary,nil)==errSecSuccess else{throw NSError(domain:"Keychain",code:1,userInfo:[NSLocalizedDescriptionKey:"Unable to store authentication securely"])} }
    static func delete(_ account:String) {SecItemDelete([kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.thunder.SignalTracker",kSecAttrAccount as String:account] as CFDictionary)}
}
