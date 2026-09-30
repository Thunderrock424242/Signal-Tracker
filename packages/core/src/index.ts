import { z } from 'zod';
export const SessionSchema=z.any(), MeasurementSchema=z.any();
export type SignalMeasurement={id:string;timestamp:string;receiverID:string;receiverType:string;provenance:'measured'|'simulated';signalIdentifier?:string;rssiDbm?:number;location?:{latitude:number;longitude:number;horizontalAccuracy:number}};
export const estimateRegion=(_samples:SignalMeasurement[]):{algorithm:string;radiusMeters:number;sampleCount:number;label:string;confidence:string}|undefined=>undefined;
export const smoothRSSI=(_values:number[],_alpha?:number):number[]=>[];
export const createDemoSession=():any=>({});
export const distanceMeters=(_a:unknown,_b:unknown)=>0;
export const bearingDegrees=(_a:unknown,_b:unknown)=>-1;
export const exportCSV=(_s:unknown)=>'';
export const exportGeoJSON=(_s:unknown):any=>({type:'FeatureCollection',features:[]});
export const parseReceiverPacket=(_p:unknown):any=>({});
export interface QueueStorage {read():Promise<string>;write(value:string):Promise<void>}
export class SyncQueue {constructor(_storage:QueueStorage){} async enqueue(_id:string){} async flush(_send:(id:string)=>Promise<void>){} async pending(){return [];} async remove(_id:string){} }
