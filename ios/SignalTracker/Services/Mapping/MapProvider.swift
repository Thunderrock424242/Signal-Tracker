import Foundation
import MapKit
protocol MapProvider {var attribution:String {get};var supportsDownloadedTiles:Bool {get};func tileOverlay()->MKTileOverlay?}
struct AppleMapProvider:MapProvider {let attribution="Apple Maps · online imagery";let supportsDownloadedTiles=false;func tileOverlay()->MKTileOverlay? {nil}}
/// Insert a licensed, bounded offline-tile implementation here. Route geometry is provider-independent.
protocol OfflineTileProvider:MapProvider {func tile(z:Int,x:Int,y:Int) async throws ->Data?;func installedRegions() async throws ->[String]}
