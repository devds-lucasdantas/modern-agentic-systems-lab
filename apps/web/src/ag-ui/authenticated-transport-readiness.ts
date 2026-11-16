/**
 * MASL 2.6Q — selected transport provenance/recovery readiness *fixture*.
 * AG-UI 1.0 frozen @2330368a2a74573902858867072406638ba3073d.
 * This pure contract composes published 2.6P -> 2.6O/N/M/L/K/J; callbacks
 * are test-harness assertions, not TLS sessions, cryptographic proofs,
 * event-source verification, network transport, storage transactions or
 * production authorization. A separate Python test performs real loopback
 * mTLS/SQLite experiments; that DOES NOT authenticate these TS callbacks.
 */
import {makeSelectedCrossServiceRecoveryGate,reviewCrossServiceRecoveryBlockers,
  type CrossServiceFixtureAdapters} from './cross-service-recovery'

type Rec=Record<string,unknown>
const record=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,fields:readonly string[]):boolean=>
  Object.keys(v).length===fields.length&&fields.every(field=>Object.hasOwn(v,field))
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const seconds=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const PEER=['kind','verifiedBy','peerServiceId','channelId','peerCertSha256',
  'audience','issuedAt','validThrough'] as const
const PRODUCER=['kind','originServiceId','channelId','threadId','runId',
  'observedAt','eventSha256'] as const
export type FixturePeer=Readonly<{
  kind:'fixture-mtls-peer';verifiedBy:'local-harness-only';peerServiceId:string;
  channelId:string;peerCertSha256:string;audience:'masl-agui-fixture';
  issuedAt:number;validThrough:number
}>
export type FixtureProducer=Readonly<{
  kind:'fixture-producer-observation';originServiceId:string;channelId:string;
  threadId:string;runId:string;observedAt:number;eventSha256:string
}>
export interface TransportReadinessFixtureAdapters extends CrossServiceFixtureAdapters{
  readonly resolveLocalPeerFixture:(channelRef:string)=>unknown
  readonly inspectProducerFixture:(channelId:string,threadId:string,runId:string)=>unknown
}
export type TransportReadinessVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'isolated-mtls-readiness-contract-only';
    tenantId:string;principalId:string;plannedCommits:number;duplicates:number;
    receiptReconciled:boolean;exposedEvents:0;actualMtlsAuthenticated:false;
    producerSignatureVerified:false;networkRecoveryVerified:false;
    durableReceiptVerified:false;adapterReady:false}>
 | Readonly<{status:'blocked';stage:'request'|'peer'|'producer'|'published-2.6P';code:string;
    exposedEvents:0;actualMtlsAuthenticated:false;producerSignatureVerified:false;
    networkRecoveryVerified:false;durableReceiptVerified:false;adapterReady:false}>

/** No caller-supplied certificate, producer, receipt, ACL or signed metadata.
 * A caller-provided declaredCommitment is NEVER accepted as an event digest
 * proof; the producer callback remains a fixture, not a trusted source.
 */
export function makeSelectedTransportReadinessGate(adapters:TransportReadinessFixtureAdapters){
  const blocked=(stage:Extract<TransportReadinessVerdict,{status:'blocked'}>['stage'],code:string):TransportReadinessVerdict=>
    ({status:'blocked',stage,code,exposedEvents:0,actualMtlsAuthenticated:false,
      producerSignatureVerified:false,networkRecoveryVerified:false,
      durableReceiptVerified:false,adapterReady:false})
  return Object.freeze({review:(request:unknown):TransportReadinessVerdict=>{
    if(!record(request)||!exact(request,['channelRef','mode','credentialRef','intents'])||
       !ident(request.channelRef)||!ident(request.credentialRef)||
       (request.mode!=='propose'&&request.mode!=='reconcile')||
       !Array.isArray(request.intents)||request.intents.length<1||request.intents.length>16)
      return blocked('request','untrusted-transport-request-shape')
    let peer:unknown,now:unknown
    try{peer=adapters.resolveLocalPeerFixture(request.channelRef);now=adapters.clockSeconds()}
    catch{return blocked('peer','fixture-mtls-boundary-unavailable')}
    if(!seconds(now))return blocked('peer','fixture-transport-clock-invalid')
    if(!record(peer)||!exact(peer,PEER)||peer.kind!=='fixture-mtls-peer'||
       peer.verifiedBy!=='local-harness-only'||peer.peerServiceId!=='fixture-gateway'||
       !ident(peer.channelId)||!hex(peer.peerCertSha256)||
       peer.audience!=='masl-agui-fixture'||!seconds(peer.issuedAt)||
       !seconds(peer.validThrough))return blocked('peer','fixture-peer-unverifiable')
    const p=peer as FixturePeer
    if(p.issuedAt>(now as number)||(now as number)-p.issuedAt>10||
       p.validThrough<(now as number)||p.validThrough<=p.issuedAt||
       p.validThrough-p.issuedAt>60)return blocked('peer','fixture-peer-not-current')
    const observed=new Set<string>()
    for(const item of request.intents){
      if(!record(item)||!ident(item.threadId)||!ident(item.runId))
        return blocked('producer','fixture-producer-intent-invalid')
      const key=item.threadId+':'+item.runId
      if(observed.has(key))continue // duplicate intents are checked by published 2.6P
      observed.add(key)
      let raw:unknown
      try{raw=adapters.inspectProducerFixture(p.channelId,item.threadId,item.runId)}
      catch{return blocked('producer','fixture-producer-unavailable')}
      if(!record(raw)||!exact(raw,PRODUCER)||
         raw.kind!=='fixture-producer-observation'||raw.originServiceId!==p.peerServiceId||
         raw.channelId!==p.channelId||raw.threadId!==item.threadId||raw.runId!==item.runId||
         raw.observedAt!==now||!hex(raw.eventSha256))
        return blocked('producer','fixture-producer-observation-unbound')
    }
    // Pure prior gate; NO real event bytes, TLS or database transaction here.
    const verdict=makeSelectedCrossServiceRecoveryGate({
      clockSeconds:()=>now,
      signedProviderMetadataFixture:adapters.signedProviderMetadataFixture,
      verifyCredentialServiceFixture:adapters.verifyCredentialServiceFixture,
      revocationServiceFixture:adapters.revocationServiceFixture,
      readCheckpointServiceFixture:adapters.readCheckpointServiceFixture,
      receiptServiceFixture:adapters.receiptServiceFixture,
    }).review({mode:request.mode,credentialRef:request.credentialRef,intents:request.intents})
    if(verdict.status==='blocked')return blocked('published-2.6P','published-2.6P:'+verdict.code)
    return {status:verdict.status,scope:'isolated-mtls-readiness-contract-only',
      tenantId:verdict.tenantId,principalId:verdict.principalId,
      plannedCommits:verdict.plannedCommits,duplicates:verdict.duplicates,
      receiptReconciled:verdict.receiptReconciled,exposedEvents:0,
      actualMtlsAuthenticated:false,producerSignatureVerified:false,
      networkRecoveryVerified:false,durableReceiptVerified:false,adapterReady:false}
  }})
}
export function reviewTransportReadinessBlockers(){
  const prior=reviewCrossServiceRecoveryBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsOpen,
    parentMilestoneOpen:prior.parentMilestoneOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    actualNetworkMutualTlsVerifiedInTS:false as const,
    trustedFederatedIssuerVerified:false as const,
    signedEventProducerAuthenticated:false as const,
    productionTransportRecoveryVerified:false as const,
    distributedReceiptDurabilityVerified:false as const,
    revocationFreshnessSlaVerified:false as const,
    mediaDlpSignedOff:false as const,
    independentSecurityReview:false as const,
    adapterReady:false as const,
    scope:'pure-ts-transport-fixture-plus-separate-offline-loopback-mtls-sqlite' as const,
  })
}
