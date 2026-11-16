/**
 * MASL 2.6O — selected issuer/JWKS snapshot, jti revocation and store-failure gates.
 * Frozen upstream AG-UI 1.0 @2330368a2a74573902858867072406638ba3073d.
 * PURE TEST-HARNESS contract, not JWT verification, OIDC, JWKS retrieval,
 * live revocation, transaction, storage adapter or Agent Server integration.
 * Composes published 2.6N (which composes 2.6M/L/K/J). Actual RS256 signature
 * verification and SQLite fault injection happen SEPARATELY in Python fixture.
 * No authority may be inferred from fixture tags or mock callback output.
 */
import {makeSelectedExternalInteropGate, reviewExternalInteropBlockers,
  type FixtureVerifiedPrincipal} from './external-interop-gates'

type Rec=Record<string,unknown>
const record=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,fields:readonly string[]):boolean=>
  Object.keys(v).length===fields.length&&fields.every(f=>Object.hasOwn(v,f))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const time=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const TRUST_FIELDS=['kind','issuer','audience','generation','activeKids','disabledKids'] as const
const CLAIM_FIELDS=['provenance','principalId','tenantId','allowedThreadIds','policyEpoch',
  'issuer','audience','keyId','tokenId','issuedAt','notBefore','expiresAt','trustGeneration'] as const
const REVOCATION_FIELDS=['kind','tenantId','tokenId','trustGeneration','revoked','observedAt'] as const

export type FixtureIssuerTrust=Readonly<{
  kind:'fixture-issuer-snapshot';issuer:string;audience:string;generation:number;
  activeKids:readonly string[];disabledKids:readonly string[]
}>
export type FixtureIssuerIdentity=Readonly<Omit<FixtureVerifiedPrincipal,'provenance'>&{
  provenance:'issuer-fixture-callback';trustGeneration:number
}>
export type FixtureRevocation=Readonly<{
  kind:'fixture-jti-lookup';tenantId:string;tokenId:string;trustGeneration:number;
  revoked:boolean;observedAt:number
}>
export interface IssuerFailureAdapters{
  readonly clockSeconds:()=>unknown
  readonly trustSnapshotFixture:()=>unknown
  readonly verifyIssuerFixture:(credentialRef:string)=>unknown
  readonly revocationLookupFixture:(tenantId:string,tokenId:string)=>unknown
  readonly readCheckpointFixture:(tenantId:string,principalId:string)=>unknown
}
export type IssuerFailureVerdict=
  | Readonly<{status:'planned';scope:'selected-issuer-revocation-fixture-only';
      tenantId:string;principalId:string;expectedRevision:number;nextRevision:number;
      plannedCommits:number;duplicates:number;noEventExposure:true;
      externalIssuerVerified:false;liveRevocationVerified:false;atomicTrustStoreVerified:false;
      productionRecoveryVerified:false;adapterReady:false}>
  | Readonly<{status:'blocked';code:string;
      stage:'request'|'trust-snapshot'|'fixture-signature'|'fixture-revocation'|'prior-contract';
      exposedEvents:0;externalIssuerVerified:false;liveRevocationVerified:false;
      atomicTrustStoreVerified:false;productionRecoveryVerified:false;adapterReady:false}>

/** Refuse unknown keys, untrusted issuer/kid, stale revocation snapshots and callback failure.
 * The application sees ONLY a synthetic plan, after all checks pass.
 * This is never an operational authorization decision, even on status=planned.
 */
export function makeSelectedIssuerFailureGate(adapters:IssuerFailureAdapters){
  const block=(code:string,stage:Extract<IssuerFailureVerdict,{status:'blocked'}>['stage']):IssuerFailureVerdict=>
    ({status:'blocked',code,stage,exposedEvents:0,externalIssuerVerified:false,
      liveRevocationVerified:false,atomicTrustStoreVerified:false,
      productionRecoveryVerified:false,adapterReady:false})
  return Object.freeze({review:(input:unknown):IssuerFailureVerdict=>{
    if(!record(input)||!exact(input,['credentialRef','intents'])||
       !id(input.credentialRef)||!Array.isArray(input.intents)||
       input.intents.length<1||input.intents.length>16)
      return block('untrusted-request-shape','request')
    let now:unknown,trust:unknown
    try{now=adapters.clockSeconds();trust=adapters.trustSnapshotFixture()}
    catch{return block('fixture-trust-unavailable','trust-snapshot')}
    if(!time(now))return block('fixture-clock-invalid','trust-snapshot')
    if(!record(trust)||!exact(trust,TRUST_FIELDS)||
       trust.kind!=='fixture-issuer-snapshot'||
       trust.issuer!=='https://fixture.invalid/masl-issuer'||
       trust.audience!=='masl-agui-fixture'||!time(trust.generation)||
       !Array.isArray(trust.activeKids)||trust.activeKids.length<1||trust.activeKids.length>8||
       !trust.activeKids.every(id)||new Set(trust.activeKids).size!==trust.activeKids.length||
       !Array.isArray(trust.disabledKids)||trust.disabledKids.length>8||
       !trust.disabledKids.every(id)||new Set(trust.disabledKids).size!==trust.disabledKids.length||
       trust.disabledKids.some(k=>(trust.activeKids as unknown[]).includes(k)))
      return block('fixture-trust-snapshot-invalid','trust-snapshot')
    const pinned=trust as FixtureIssuerTrust
    let raw:unknown
    try{raw=adapters.verifyIssuerFixture(input.credentialRef)}
    catch{return block('fixture-verifier-unavailable','fixture-signature')}
    if(!record(raw)||!exact(raw,CLAIM_FIELDS)||raw.provenance!=='issuer-fixture-callback'||
       !id(raw.principalId)||!id(raw.tenantId)||!id(raw.keyId)||!id(raw.tokenId)||
       !Array.isArray(raw.allowedThreadIds)||raw.allowedThreadIds.length<1||
       raw.allowedThreadIds.length>16||!raw.allowedThreadIds.every(id)||
       new Set(raw.allowedThreadIds).size!==raw.allowedThreadIds.length||
       !time(raw.policyEpoch)||!time(raw.issuedAt)||!time(raw.notBefore)||
       !time(raw.expiresAt)||raw.issuer!==pinned.issuer||raw.audience!==pinned.audience||
       raw.trustGeneration!==pinned.generation)
      return block('fixture-issuer-claim-invalid','fixture-signature')
    const claim=raw as FixtureIssuerIdentity
    if(!pinned.activeKids.includes(claim.keyId)||pinned.disabledKids.includes(claim.keyId))
      return block('fixture-issuer-key-disabled','fixture-signature')
    if(claim.issuedAt>(now as number)||claim.notBefore>(now as number)||
       claim.expiresAt<=(now as number)||claim.expiresAt<=claim.issuedAt||
       claim.expiresAt-claim.issuedAt>300)
      return block('fixture-credential-time-invalid','fixture-signature')
    let revocation:unknown
    try{revocation=adapters.revocationLookupFixture(claim.tenantId,claim.tokenId)}
    catch{return block('fixture-revocation-unavailable','fixture-revocation')}
    if(!record(revocation)||!exact(revocation,REVOCATION_FIELDS)||
       revocation.kind!=='fixture-jti-lookup'||
       revocation.tenantId!==claim.tenantId||revocation.tokenId!==claim.tokenId||
       revocation.trustGeneration!==pinned.generation||
       typeof revocation.revoked!=='boolean'||revocation.observedAt!==now)
      return block('fixture-revocation-not-current','fixture-revocation')
    if(revocation.revoked)return block('fixture-token-revoked','fixture-revocation')
    // The published 2.6N gate still considers this fixture-only and refuses
    // any implication of real signature proof, actual storage or production.
    const inherited:FixtureVerifiedPrincipal={provenance:'fixture-verifier-callback',
      principalId:claim.principalId,tenantId:claim.tenantId,
      allowedThreadIds:claim.allowedThreadIds,policyEpoch:claim.policyEpoch,
      issuer:claim.issuer,audience:claim.audience,keyId:claim.keyId,tokenId:claim.tokenId,
      issuedAt:claim.issuedAt,notBefore:claim.notBefore,expiresAt:claim.expiresAt}
    const prior=makeSelectedExternalInteropGate({
      verifyCredentialFixture:()=>inherited,
      readCheckpointFixture:(tenant,principal)=>adapters.readCheckpointFixture(tenant,principal),
      clockSeconds:()=>now,
    }).review({credentialRef:input.credentialRef,intents:input.intents})
    if(prior.status==='blocked')return block('published-2.6N:'+prior.code,'prior-contract')
    return {status:'planned',scope:'selected-issuer-revocation-fixture-only',
      tenantId:prior.tenantId,principalId:prior.principalId,
      expectedRevision:prior.expectedRevision,nextRevision:prior.nextRevision,
      plannedCommits:prior.plannedCommits,duplicates:prior.duplicates,noEventExposure:true,
      externalIssuerVerified:false,liveRevocationVerified:false,
      atomicTrustStoreVerified:false,productionRecoveryVerified:false,adapterReady:false}
  }})
}

/** Explicitly non-approving cross-boundary inventory. */
export function reviewIssuerFailureBlockers(){
  const prior=reviewExternalInteropBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsOpen,parentMilestoneOpen:prior.parentMilestoneOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    externalIssuerAuthenticated:false as const,
    networkJwksProven:false as const,
    productionKeyRotationProven:false as const,
    crossServiceRevocationProven:false as const,
    revocationCommitAtomicityProven:false as const,
    transactionAckRecoveryProven:false as const,
    durableStoreFailureRecoveryProven:false as const,
    operationalAgUiResumeProven:false as const,
    independentSecurityReview:false as const,
    adapterReady:false as const,
    scope:'isolated-issuer-fixture-plus-separate-sqlite-failure-tests' as const,
  })
}
