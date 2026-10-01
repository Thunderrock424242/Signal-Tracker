import Foundation
public struct ReceiverPacket:Decodable,Sendable {
    public let batteryPercent:Double?
    public let version:Int;public let kind:String;public let id:UUID?;public let timestamp:Date;public let receiverId:String;public let receiverType:ReceiverType?;public let frequencyHz:Double?;public let bandwidthHz:Double?;public let powerDb:Double?;public let powerUnit:PowerUnit;public let signalIdentifier:String?;public let location:LocationFix?;public let bearingDegrees:Double?;public let bearingAccuracyDegrees:Double?;public let centerFrequencyHz:Double?;public let spanHz:Double?;public let bins:[Double]?
    public static func decode(_ data:Data) throws ->ReceiverPacket {guard data.count<=128_000 else{throw DataError.invalid("Receiver packet too large")};let packet=try JSONCoding.decoder().decode(Self.self,from:data);guard packet.version==1 && (packet.batteryPercent.map {$0.isFinite && (0...100).contains($0)} ?? true) && (packet.measurement?.isValid == true || packet.frame?.isValid == true) else{throw DataError.invalid("Invalid receiver packet")};return packet}
    public var measurement:SignalMeasurement? {
        guard kind=="measurement",let power=powerDb,let target=signalIdentifier else{return nil}
        var m=SignalMeasurement(id:id ?? UUID(),timestamp:timestamp,receiverID:receiverId,receiverType:receiverType ?? .sdr,provenance:.measured,signalIdentifier:target,powerDb:power,powerUnit:powerUnit,location:location);m.frequencyHz=frequencyHz;m.bandwidthHz=bandwidthHz;m.bearingDegrees=bearingDegrees;m.bearingAccuracyDegrees=bearingAccuracyDegrees;return m
    }
    public var frame:SpectrumFrame? {guard kind=="spectrum",let center=centerFrequencyHz,let span=spanHz,let bins=bins else{return nil};return SpectrumFrame(id:id ?? UUID(),timestamp:timestamp,receiverID:receiverId,provenance:.measured,centerFrequencyHz:center,spanHz:span,powerUnit:powerUnit,bins:bins)}
}
