/**
 * Claims that say which party a session is currently acting as.
 *
 * Switching affiliation issues a token carrying only the new party's claim, so
 * each of these has to be emitted explicitly - `null` when the token omits it.
 * `sessionUpdate()` posts the payload as JSON and `JSON.stringify` drops
 * `undefined`, so a key that never arrives cannot overwrite anything: the jwt
 * callback merges with `{...token.user, ...info}`, leaving the previous
 * affiliation's id in the session where it outranks the new one.
 */
export const PARTY_CLAIM_KEYS = [
  "CustomsId",
  "MerchantId",
  "RefundPointId",
  "TaxFreeId",
  "TaxOfficeId",
  "TourGuideId",
  "TravellerId",
  "TravellerDocumentId",
  "PartyLevel",
] as const;

export type PartyClaimKey = (typeof PARTY_CLAIM_KEYS)[number];

export function buildUserData(
  access_token: string,
  refresh_token: string,
  expiration_date: number
) {
  const decoded_jwt = JSON.parse(
    Buffer.from(access_token.split(".")[1] || "", "base64").toString()
  );
  return {
    refresh_token,
    expiration_date,
    userName: decoded_jwt.unique_name,
    name: decoded_jwt.given_name,
    surname: decoded_jwt.family_name ?? "",
    email: decoded_jwt.email,
    sub: decoded_jwt.sub,
    role: decoded_jwt.role ?? null,
    CustomsId: decoded_jwt.CustomsId ?? null,
    MerchantId: decoded_jwt.MerchantId ?? null,
    RefundPointId: decoded_jwt.RefundPointId ?? null,
    TaxFreeId: decoded_jwt.TaxFreeId ?? null,
    TaxOfficeId: decoded_jwt.TaxOfficeId ?? null,
    TourGuideId: decoded_jwt.TourGuideId ?? null,
    TravellerId: decoded_jwt.TravellerId ?? null,
    TravellerDocumentId: decoded_jwt.TravellerDocumentId ?? null,
    PartyLevel: decoded_jwt.PartyLevel ?? null,
  };
}
