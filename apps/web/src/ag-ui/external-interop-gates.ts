/**
 * MASL 2.6N: selected external-identity/durable-store INTEROPERABILITY GATES.
 * Frozen AG-UI 1.0 reference: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * This is a pure adapter-contract TEST HARNESS, not a credential verifier,
 * externally trusted identity, persistent DB adapter or Agent Server bridge.
 * Real HMAC/JWT fixture and SQLite transactions are exercised separately by
 * the Python runner. Its results do NOT authenticate this TypeScript callback.
 */
import {makeIsolatedTrustedBoundaryForTests,reviewTransactionalIdentityBlockers} from './trusted-transaction-boundary'
import type {SyntheticServerContext} from './authorized-durable-replay'

type RecordValue=Record<string,unknown>
const record=(x:unknown):x is RecordValue=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x:RecordValue,fields:readonly string[]):boolean=>
  Object.keys(x).length===fields.length&&fields.every(f=>Object.hasOwn(x,f))
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(x)
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2_000_000_000
export type FixtureVerifiedPrincipal=Readonly<{
  provenance:'fixture-verifier-callback';principalId:string;tenantId:string;
  allowedThreadIds:readonly string[];policyEpoch:number;
  issuer:string;audience:string;keyId:string;tokenId:string;
  issuedAt:number;notBefore:number;expiresAt:number;
}>
export interface InteropFixtureAdapters {
  readonly verifyCredentialFixture:(credentialRef:string)=>unknown
  readonly readCheckpointFixture:(tenantId:string,principalId:string)=>unknown
  readonly clockSeconds:()=>unknown
}
export type InteropVerdict=
 | Readonly<{status:'planned';scope:'fixture-interop-only';tenantId:string;principalId:string;
     expectedRevision:number;nextRevision:number;plannedCommits:number;duplicates:number;
     noEventExposure:true;externalAuthVerified:false;durableCommitVerified:false;
     crossServiceTrustVerified:false;adapterReady:false}>
 | Readonly<{status:'blocked';code:string;atBoundary:'request'|'fixture-verifier'|'fixture-store'|'prior-contract';
     exposedEvents:0;externalAuthVerified:false;durableCommitVerified:false;
     crossServiceTrustVerified:false;adapterReady:false}>

const IDENTITY_FIELDS=['provenance','principalId','tenantId','allowedThreadIds','policyEpoch',
  'issuer','audience','keyId','tokenId','issuedAt','notBefore','expiresAt'] as const

/** Neither a `fixture-verifier-callback` tag nor a string keyId proves signature verification. */
export function makeSelectedExternalInteropGate(adapters:InteropFixtureAdapters){
  const block=(code:string,atBoundary:Extract<InteropVerdict,{status:'blocked'}>['atBoundary']):InteropVerdict=>
    ({status:'blocked',code,atBoundary,exposedEvents:0,externalAuthVerified:false,
      durableCommitVerified:false,crossServiceTrustVerified:false,adapterReady:false})
  return Object.freeze({review:(input:unknown):InteropVerdict=>{
    if(!record(input)||!exact(input,['credentialRef','intents'])||
       !id(input.credentialRef)||!Array.isArray(input.intents)||
       input.intents.length<1||input.intents.length>16)
      return block('untrusted-request-shape','request')
    let now:unknown,identity:unknown
    try {now=adapters.clockSeconds();identity=adapters.verifyCredentialFixture(input.credentialRef)}
    catch{return block('fixture-verifier-unavailable','fixture-verifier')}
    if(!positive(now))return block('fixture-clock-invalid','fixture-verifier')
    if(!record(identity)||!exact(identity,IDENTITY_FIELDS)||
       identity.provenance!=='fixture-verifier-callback'||
       !id(identity.principalId)||!id(identity.tenantId)||
       !Array.isArray(identity.allowedThreadIds)||identity.allowedThreadIds.length<1||
       identity.allowedThreadIds.length>16||!identity.allowedThreadIds.every(id)||
       new Set(identity.allowedThreadIds).size!==identity.allowedThreadIds.length||
       !positive(identity.policyEpoch)||!id(identity.keyId)||!id(identity.tokenId)||
       identity.issuer!=='https://fixture.invalid/masl-issuer'||
       identity.audience!=='masl-agui-fixture'||
       !positive(identity.issuedAt)||!positive(identity.notBefore)||!positive(identity.expiresAt))
      return block('fixture-identity-unverifiable','fixture-verifier')
    const verified=identity as FixtureVerifiedPrincipal
    const seconds=now as number
    if(verified.issuedAt>seconds||verified.notBefore>seconds||
       verified.expiresAt<=seconds||verified.expiresAt<=verified.issuedAt||
       verified.expiresAt-verified.issuedAt>300)
      return block('fixture-identity-time-boundary','fixture-verifier')
    // This is a mapping into the existing 2.6M synthetic boundary, NOT a real
    // trust promotion. The request cannot inject the principal, tenant or seed.
    const context:SyntheticServerContext={origin:'synthetic-server-boundary',
      principalId:verified.principalId,tenantId:verified.tenantId,
      allowedThreadIds:verified.allowedThreadIds,policyEpoch:verified.policyEpoch}
    let snapshot:unknown
    try{snapshot=adapters.readCheckpointFixture(verified.tenantId,verified.principalId)}
    catch{return block('fixture-store-unavailable','fixture-store')}
    if(!record(snapshot)||snapshot.tenantId!==verified.tenantId||
       snapshot.policyEpoch!==verified.policyEpoch)
      return block('fixture-snapshot-not-bound','fixture-store')
    const prior=makeIsolatedTrustedBoundaryForTests({
      resolveSessionForTest:()=>context,readCheckpointForTest:()=>snapshot,
    }).review({sessionRef:input.credentialRef,intents:input.intents})
    if(prior.status==='blocked')return block('published-2.6M:'+prior.code,'prior-contract')
    return {status:'planned',scope:'fixture-interop-only',tenantId:prior.tenantId,
      principalId:prior.principalId,expectedRevision:prior.expectedRevision,
      nextRevision:prior.nextRevision,plannedCommits:prior.plannedCommits,
      duplicates:prior.duplicateCount,noEventExposure:true,
      externalAuthVerified:false,durableCommitVerified:false,
      crossServiceTrustVerified:false,adapterReady:false}
  }})
}

/** Planning-only truth table: must never be interpreted as readiness. */
export function reviewExternalInteropBlockers(){
  const prior=reviewTransactionalIdentityBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsRemainOpen,
    parentMilestoneOpen:prior.milestone2_6Open,
    priorAdapterBlocked:!prior.agentServerAdapterReady,
    externalIssuerAuthenticated:false as const,
    realCredentialTransportVerified:false as const,
    independentThreadAclVerified:false as const,
    externalStoreTransactionVerified:false as const,
    crossServiceCasVerified:false as const,
    productionKeyRotationVerified:false as const,
    tokenRevocationVerified:false as const,
    operationalAgUiResumeVerified:false as const,
    independentSecurityReview:false as const,
    adapterReady:false as const,
    scope:'isolated-ts-contract-plus-separate-local-hmac-sqlite-fixture' as const,
  })
}
