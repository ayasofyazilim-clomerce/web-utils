# `tag`

Unirefund QR kodlarının nasıl üretildiğinin ve nasıl çözüldüğünün tek tanımı olan **[`@unirefund/qr`](https://github.com/ayasofyazilim-clomerce/unirefund-qr)** paketinin yeniden dışa aktarımı.

_English: [README.md](./README.md)_

Burada bir uygulama yok. `index.tsx`, paketi yeniden dışa aktarır; böylece mevcut tüm `@repo/utils/tag` importları çalışmaya devam eder.

**Biçimle ilgili bir şeyi değiştirmeden önce paketin README dosyasını okuyun.** Biçim değişirse paketin golden fixture'ları tüm tüketen uygulamalarda aynı anda kırılır; amaç da tam olarak bu.

## Biçim neden bir pakette yaşıyor

Aynı biçimi backend, web uygulamaları ve iki mobil uygulama birlikte üretir ve tüketir. Tam olarak tek bir uygulamaya ihtiyaç duyar.

Bu paketin içinde kalamazdı. Buradaki manifest `workspace:*` bağımlılıklarının yanı sıra Next.js, `next-auth` ve `ioredis` taşıyor ve bunların hiçbiri bir Expo uygulamasına kurulamaz. `@unirefund/qr` ise hiçbir bağımlılığı olmayan; Node, tarayıcılar, Edge runtime ve Hermes üzerinde çalışan bir pakettir — yani sunucu bileşenlerinden, istemci bileşenlerinden ve middleware'den çağrılması hâlâ güvenlidir; bu dizinin daha önce verdiği garanti de buydu.

Ayrıca bu dizin yalnızca çözme işlemi yapıyordu. Bir üreticisi yoktu; yani burada hiçbir şey kod üretemezdi.

## Neler kullanılabilir

Daha önce burada bulunan `decodeTagSlug` / `decodeTagScan` dışında:

| Dışa aktarım                                                   | Amacı                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `encodeTagSlug`, `buildTagUrl`                                 | bir slug veya tam genel etiket URL'si üretir                                               |
| `resolveTagLink`                                               | **backend'in `publicLink` alanını tercih eder**, yerel üretimi yalnızca yedek olarak yapar |
| `decodeTagSlug`, `decodeTagScan`, `slugFromScan`               | slug, okunan kod veya route parametresi çözer                                              |
| `buildValidateUrl`, `extractValidateQrValue`, `isValidateScan` | havalimanı doğrulama URL'si                                                                |
| `base64UrlEncode`, `base64UrlDecode`                           | doğrudan ihtiyaç duyulursa codec                                                           |

## Tekrar etmeye değer kural

**Bu biçimin sahibi backend'dir. `publicLink` alanını tercih edin.**

`TagDetailDto` üzerinden `publicLink` elinizdeyse onu kullanın; URL'yi yeniden kurmayın. `apps/web` bunu hâlihazırda yapıyor. `resolveTagLink`, yerel üretimi yalnızca kanonik bağlantının gerçekten henüz mevcut olmadığı yerde yapar; bu da POS'ta tek bir akıştır, burada ise hiç yoktur.

## Kurulum notu

Paket **private** bir git deposundan kurulur ve `prepare` script'i ile kurulum sırasında kendini derler. pnpm 10, git üzerinden gelen paketlerin build script'lerini izin listesinde olmadıkça çalıştırmaz; bu yüzden workspace kökündeki `pnpm-workspace.yaml` şunu içerir:

```yaml
onlyBuiltDependencies:
  - "@unirefund/qr"
```

Bu depoyu kuran her makinenin ve her CI koşucusunun ayrıca `ayasofyazilim-clomerce/unirefund-qr` deposuna okuma yetkisi olan GitHub kimlik bilgilerine ihtiyacı vardır.
