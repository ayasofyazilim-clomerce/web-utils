# `tag`

A re-export of **[`@unirefund/qr`](https://github.com/ayasofyazilim-clomerce/unirefund-qr)**, the single definition of how Unirefund QR codes are written and read.

_Türkçe: [README.tr.md](./README.tr.md)_

There is no implementation here. `index.tsx` re-exports the package so every existing `@repo/utils/tag` import keeps working.

**Read the package's README before changing anything about the format.** Its golden fixtures fail in every consuming app at once if the format changes, which is the point.

## Why the format lives in a package

The same format is produced and consumed by the backend, the web apps and both mobile apps. It needs exactly one implementation.

It could not live in this package. The manifest here carries `workspace:*` dependencies plus Next.js, `next-auth` and `ioredis`, none of which an Expo app can install. `@unirefund/qr` has zero dependencies and runs on Node, browsers, the Edge runtime and Hermes alike — so it is still safe to call from server components, client components and middleware, which is what this directory previously guaranteed.

This directory also only ever decoded. It had no encoder, so nothing here could produce a code.

## What you get

Beyond the `decodeTagSlug` / `decodeTagScan` that were here before:

| Export                                                         | Purpose                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `encodeTagSlug`, `buildTagUrl`                                 | produce a slug or a full public tag URL                                  |
| `resolveTagLink`                                               | **prefer the backend's `publicLink`**, encode locally only as a fallback |
| `decodeTagSlug`, `decodeTagScan`, `slugFromScan`               | resolve a slug, a scan, or a route param                                 |
| `buildValidateUrl`, `extractValidateQrValue`, `isValidateScan` | the airport validate URL                                                 |
| `base64UrlEncode`, `base64UrlDecode`                           | the codec, if you need it directly                                       |

## The rule worth repeating

**The backend owns this format. Prefer `publicLink`.**

When you have `publicLink` from `TagDetailDto`, render it — do not rebuild the URL. `apps/web` already does this. `resolveTagLink` encodes locally only where the canonical link genuinely does not exist yet, which is one path in the POS and none here.

## Installation note

The package is installed from a **private** git repository and compiles itself on install via its `prepare` script. pnpm 10 refuses to run build scripts for git-hosted packages unless they are allowlisted, so the workspace root's `pnpm-workspace.yaml` carries:

```yaml
onlyBuiltDependencies:
  - "@unirefund/qr"
```

Any machine or CI runner installing this repo also needs GitHub credentials with read access to `ayasofyazilim-clomerce/unirefund-qr`.
