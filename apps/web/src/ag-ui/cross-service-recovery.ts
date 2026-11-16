/**
 * MASL 2.6P — isolated cross-service trust-freshness and recovery RECONCILIATION contracts.
 * Frozen AG-UI 1.0 @2330368a2a74573902858867072406638ba3073d.
 * Composes the published 2.6O -> 2.6N/M/L/K/J selected pure review.
 * All callbacks are test harness substitutes; signed-metadata tags and service
 * proof objects are NOT a cryptographic trust boundary. This module does NOT
 * perform network discovery, token validation, database writes, live revocation,
 * cross-service atomicity or Agent Server integration. No event bytes escape.
 */
import {makeSelectedIssuerFailureGate,reviewIssuerFailureBlockers,
  type FixtureIssuerIdentity,type FixtureIssuerTrust,type FixtureRevocation} from './issuer-revocation-failures'
import type {ReplayIntent} from './authorized-durable-replay'

type Rec=Record<string,unknown>
const record=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,k:readonly string[]):boolean=>Object.keys(v).length===k.length&&k.every(f=>Object.hasOwn(v,f))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const sec=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const META=['kind','issuer','audience','signerId','trustGeneration','activeKeyId',
  'revocationEpoch','observedAt','validThrough'] as const
const SERVICE=['kind','credentialRef','issuerIdentity','trustGeneration','revocationEpoch'] as const
const RECEIPT=['kind','tenantId','principalId','threadId','runId','idempotencyKey',
  'declaredCommitment','commitRevision','observedAt'] as const

export type FixtureSignedMetadata=Readonly<{
  kind:'fixture-signed-provider-metadata';issuer:string;audience:string;
  signerId:string;trustGeneration:number;activeKeyId:string;
  revocationEpoch:number;observedAt:number;validThrough:number
}>
export type FixtureServiceProof=Readonly<{
  kind:'fixture-service-proof';credentialRef:string;issuerIdentity:FixtureIssuerIdentity;
  trustGeneration:number;revocationEpoch:number
}>
export type FixtureReceipt=Readonly<{
  kind:'fixture-durable-receipt';tenantId:string;principalId:string;
  threadId:string;runId:string;idempotencyKey:string;declaredCommitment:string;
  commitRevision:number;observedAt:number
}>
export interface CrossServiceFixtureAdapters {
  readonly clockSeconds:()=>unknown
  readonly signedProviderMetadataFixture:()=>unknown
  readonly verifyCredentialServiceFixture:(credentialRef:string)=>unknown
  readonly revocationServiceFixture:(tenantId:string,tokenId:string)=>unknown
  readonly readCheckpointServiceFixture:(tenantId:string,principalId:string)=>unknown
  readonly receiptServiceFixture:(tenantId:string,threadId:string,idempotencyKey:string)=>unknown
}
export type CrossServiceVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'offline-cross-service-fixture-only';
     tenantId:string;principalId:string;expectedRevision:number;nextRevision:number;
     plannedCommits:number;duplicates:number;receiptReconciled:boolean;exposedEvents:0;
     issuerAuthenticated:false;revocationPropagationProven:false;
     crossServiceAtomicityProven:false;externalStoreVerified:false;adapterReady:false}>
 | Readonly<{status:'blocked';code:string;stage:'request'|'metadata'|'service-proof'|
      'revocation'|'prior-contract'|'receipt';exposedEvents:0;issuerAuthenticated:false;
      revocationPropagationProven:false;crossServiceAtomicityProven:false;
      externalStoreVerified:false;adapterReady:false}>

/** No caller-supplied trust, ACL, receipt or checkpoint accepted. In particular:
 * `mode=reconcile` requires an existing server-supplied exact receipt and the
 * published 2.6L replay-check; it cannot create or acknowledge a commit.
 */
export function makeSelectedCrossServiceRecoveryGate(adapters:CrossServiceFixtureAdapters){
  const block=(code:string,stage:Extract<CrossServiceVerdict,{status:'blocked'}>['stage']):CrossServiceVerdict=>
    ({status:'blocked',code,stage,exposedEvents:0,issuerAuthenticated:false,
      revocationPropagationProven:false,crossServiceAtomicityProven:false,
      externalStoreVerified:false,adapterReady:false})
  return Object.freeze({review:(input:unknown):CrossServiceVerdict=>{
    if(!record(input)||!exact(input,['mode','credentialRef','intents'])||
       !['propose','reconcile'].includes(String(input.mode))||!id(input.credentialRef)||
       !Array.isArray(input.intents)||input.intents.length<1||input.intents.length>16)
      return block('untrusted-request-shape','request')
    const mode=input.mode as 'propose'|'reconcile'
    let now:unknown,rawMetadata:unknown
    try{now=adapters.clockSeconds();rawMetadata=adapters.signedProviderMetadataFixture()}
    catch{return block('metadata-service-unavailable','metadata')}
    if(!sec(now))return block('invalid-fixture-clock','metadata')
    if(!record(rawMetadata)||!exact(rawMetadata,META)||
       rawMetadata.kind!=='fixture-signed-provider-metadata'||
       rawMetadata.issuer!=='https://fixture.invalid/masl-issuer'||
       rawMetadata.audience!=='masl-agui-fixture'||rawMetadata.signerId!=='fixture-root-pinned'||
       !sec(rawMetadata.trustGeneration)||rawMetadata.trustGeneration===0||
       !id(rawMetadata.activeKeyId)||!sec(rawMetadata.revocationEpoch)||
       !sec(rawMetadata.observedAt)||!sec(rawMetadata.validThrough))
      return block('metadata-snapshot-untrusted','metadata')
    const meta=rawMetadata as FixtureSignedMetadata
    const t=now as number
    if(meta.observedAt>t||t-meta.observedAt>10||meta.validThrough<t||
       meta.validThrough-meta.observedAt>60||meta.validThrough<=meta.observedAt)
      return block('metadata-stale-or-expired','metadata')
    let rawProof:unknown
    try{rawProof=adapters.verifyCredentialServiceFixture(input.credentialRef)}
    catch{return block('credential-service-unavailable','service-proof')}
    if(!record(rawProof)||!exact(rawProof,SERVICE)||rawProof.kind!=='fixture-service-proof'||
       rawProof.credentialRef!==input.credentialRef||
       rawProof.trustGeneration!==meta.trustGeneration||
       rawProof.revocationEpoch!==meta.revocationEpoch||!record(rawProof.issuerIdentity))
      return block('credential-proof-unbound','service-proof')
    const proof=rawProof as FixtureServiceProof
    const claim=proof.issuerIdentity
    if(claim.trustGeneration!==meta.trustGeneration||claim.keyId!==meta.activeKeyId||
       claim.issuer!==meta.issuer||claim.audience!==meta.audience)
      return block('service-issuer-generation-conflict','service-proof')
    let revocation:unknown
    try{revocation=adapters.revocationServiceFixture(claim.tenantId,claim.tokenId)}
    catch{return block('revocation-service-unavailable','revocation')}
    if(!record(revocation)||revocation.kind!=='fixture-jti-lookup'||
       revocation.tenantId!==claim.tenantId||revocation.tokenId!==claim.tokenId||
       revocation.trustGeneration!==meta.trustGeneration||revocation.observedAt!==t||
       typeof revocation.revoked!=='boolean')
      return block('revocation-service-not-fresh','revocation')
    if(revocation.revoked)return block('revoked-at-service-boundary','revocation')
    const trust:FixtureIssuerTrust={kind:'fixture-issuer-snapshot',issuer:meta.issuer,
      audience:meta.audience,generation:meta.trustGeneration,
      activeKids:[meta.activeKeyId],disabledKids:[]}
    let snapshot:unknown
    const prior=makeSelectedIssuerFailureGate({
      clockSeconds:()=>t,
      trustSnapshotFixture:()=>trust,
      verifyIssuerFixture:()=>claim,
      revocationLookupFixture:()=>revocation as FixtureRevocation,
      readCheckpointFixture:(tenant,principal)=>{
        snapshot=adapters.readCheckpointServiceFixture(tenant,principal)
        return snapshot
      },
    }).review({credentialRef:input.credentialRef,intents:input.intents})
    if(prior.status==='blocked')return block('published-2.6O:'+prior.code,'prior-contract')
    if(mode==='reconcile'){
      if(input.intents.length!==1||!record(input.intents[0])||
         input.intents[0].operation!=='replay-check'||prior.plannedCommits!==0)
        return block('reconciliation-requires-existing-replay-check','receipt')
      const intent=input.intents[0] as unknown as ReplayIntent
      let rawReceipt:unknown
      try{rawReceipt=adapters.receiptServiceFixture(prior.tenantId,intent.threadId,intent.idempotencyKey)}
      catch{return block('receipt-service-unavailable','receipt')}
      if(!record(rawReceipt)||!exact(rawReceipt,RECEIPT)||
         rawReceipt.kind!=='fixture-durable-receipt'||
         rawReceipt.tenantId!==prior.tenantId||rawReceipt.principalId!==prior.principalId||
         rawReceipt.threadId!==intent.threadId||rawReceipt.runId!==intent.runId||
         rawReceipt.idempotencyKey!==intent.idempotencyKey||
         rawReceipt.declaredCommitment!==intent.declaredCommitment||
         !sec(rawReceipt.commitRevision)||rawReceipt.commitRevision<1||
         rawReceipt.observedAt!==t||
         !record(snapshot)||!sec(snapshot.revision)||rawReceipt.commitRevision>snapshot.revision)
        return block('receipt-not-authoritative-in-fixture','receipt')
      // Equality of caller-declared commitments is not event hash validation.
      return {status:'reconciled',scope:'offline-cross-service-fixture-only',
        tenantId:prior.tenantId,principalId:prior.principalId,
        expectedRevision:prior.expectedRevision,nextRevision:prior.nextRevision,
        plannedCommits:0,duplicates:prior.duplicates,receiptReconciled:true,
        exposedEvents:0,issuerAuthenticated:false,revocationPropagationProven:false,
        crossServiceAtomicityProven:false,externalStoreVerified:false,adapterReady:false}
    }
    return {status:'planned',scope:'offline-cross-service-fixture-only',
      tenantId:prior.tenantId,principalId:prior.principalId,
      expectedRevision:prior.expectedRevision,nextRevision:prior.nextRevision,
      plannedCommits:prior.plannedCommits,duplicates:prior.duplicates,
      receiptReconciled:false,exposedEvents:0,issuerAuthenticated:false,
      revocationPropagationProven:false,crossServiceAtomicityProven:false,
      externalStoreVerified:false,adapterReady:false}
  }})
}

export function reviewCrossServiceRecoveryBlockers(){
  const prior=reviewIssuerFailureBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsOpen,parentMilestoneOpen:prior.parentMilestoneOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    realIssuerMetadataVerified:false as const,
    actualServiceChannelAuthenticated:false as const,
    distributedRevocationFreshnessProven:false as const,
    realCrossServiceTransactionProven:false as const,
    cryptographicEventDigestFromProducer:false as const,
    durableReceiptReconciliationProven:false as const,
    onlineJwksRotationProven:false as const,
    securityReviewSignedOff:false as const,
    adapterReady:false as const,
    scope:'isolated-callback-composition-plus-separate-local-process-fixture' as const,
  })
}
