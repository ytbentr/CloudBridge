# CloudBridge 1.1 — Paper 1.20.1 + Render

CloudBridge, sunucuya yalnızca bir küçük Paper eklentisi (`CloudBridge.jar`) koyar. Render tarafında JAR/dünya arşivleri saklanır ve listelenir; ayrıca önceden tanımlı bazı özellikler uzaktan ayarlanabilir.

## Önemli teknik sınır

Paper, normal eklentileri `plugins/` klasöründeki JAR dosyalarından yükler. Bu proje Render'daki rastgele `.jar` dosyalarını Java kodu olarak uzaktan çalıştırmaz ve sunucuya indirmez. Bulut kataloğu depo/listeme içindir. CloudBridge'in uzaktan uygulayabildiği özellikler, bu eklentide özellikle kodlanmış özelliklerdir:

- Oyuncuya giriş mesajı
- Sunucuya giriş duyurusu
- Giriş başlığı ve alt yazısı
- Sunucu listesi MOTD'si

Yeni özellik eklemek için CloudBridge kaynak koduna o özelliğin olay/işleyici kodu eklenip JAR yeniden derlenmelidir. Herhangi bir mevcut Java eklentisini hiç indirmeden çalıştırmak mümkün değildir. Dünya ZIP'leri de doğrudan Paper dünyası olarak buluttan yüklenmez.

## 1. Render'a yükleme

1. Bu klasörü GitHub deposuna gönder.
2. Render Dashboard'da **New > Blueprint** ile bu depodaki `render.yaml` dosyasını kullan.
3. Render servisi için Environment Variables bölümünde iki farklı güçlü gizli değer oluştur:
   - `ADMIN_TOKEN`: web panelinde yönetici girişi
   - `BRIDGE_TOKEN`: Paper eklentisinin API doğrulaması
4. `render.yaml` `/var/data` kalıcı disk ister. Render dokümanına göre kalıcı disk ücretli plan gerektirir; ücretsiz serviste bu tasarımın dosya saklaması kalıcı olmaz.
5. Deploy bitince `https://SERVIS-ADIN.onrender.com/health` adresini aç; `{"ok":true,...}` görmelisin.

## 2. CloudBridge JAR derleme

Java 17 ve Maven kurulu bilgisayarda/Termux Ubuntu ortamında:

```bash
cd paper-plugin
mvn package
```

Oluşacak JAR:

`paper-plugin/target/CloudBridge-1.1.0.jar`

Bu sohbet ortamında Maven kurulu olmadığı için derlenmiş JAR bu ZIP'e dahil değildir; kaynak proje dahildir.

## 3. Paper sunucusuna kurma

1. `CloudBridge-1.1.0.jar` dosyasını Paper 1.20.1 sunucusunun `plugins/` klasörüne koy.
2. Sunucuyu bir kez başlatıp kapat; `plugins/CloudBridge/config.yml` oluşur.
3. `api-url` değerini kendi Render URL'n yap.
4. `bridge-token` değerini Render'daki `BRIDGE_TOKEN` ile aynı yap.
5. Sunucuyu yeniden başlat.
6. Oyunda/console'da `/cloud status` ve `/cloud sync` komutlarını dene.

## 4. Bulut paneli

Render servis URL'sini tarayıcıda aç. Yönetici bölümüne `ADMIN_TOKEN` değerini gir.

- **Bulut kataloğu:** `.jar` eklenti dosyası veya `.zip` dünya arşivi yükle, listele, sil.
- **Uzaktan özellikler:** giriş mesajı, giriş duyurusu, giriş başlığı ve MOTD ayarlarını kaydet.
- CloudBridge ayarları en geç 30 saniyede bir API'den alır. Panelden değişiklik yaptıktan sonra `/cloud sync` de kullanabilirsin.

## Güvenlik

- `ADMIN_TOKEN` ve `BRIDGE_TOKEN` birbirinden farklı olsun.
- Gizli anahtarları GitHub'a veya ekran görüntüsüne koyma.
- Buluta yüklenen JAR dosyaları kod çalıştırabilir; indirip kurmadan önce kaynağına güven.
- CloudBridge buluttan kod indirmez veya çalıştırmaz; sadece sabit olarak tanımlanmış özellik yapılandırmasını uygular.
- Render kalıcı diskindeki `/var/data` dosyaları deploy ve yeniden başlatmalar arasında korunur. Disk yalnızca tek servis örneğine bağlıdır.


## Buluttaki JAR dosyasını Paper sunucusuna kurma (v1.2.0)

1. Render Environment bölümünde `BRIDGE_TOKEN` tanımlı olmalı; Paper sunucusundaki `plugins/CloudBridge/config.yml` içindeki `bridge-token` bununla birebir aynı olmalı. Token değerini paylaşmayın.
2. Yönetim panelinden bir `.jar` dosyası yükleyin. Dosya Render kataloğunda saklanır.
3. Oyunda OP yetkili hesapla `/cloud plugins` yazıp tam dosya adını görün.
4. `/cloud install DosyaAdi.jar` komutunu kullanın. Bu komut JAR'ı CloudBridge'in bulunduğu Paper sunucusunun `plugins` klasörüne indirir.
5. Sunucuyu **tamamen yeniden başlatın**. Sonra eklentinin konsolda etkinleştiğini kontrol edin.

**Güvenlik:** Yalnızca kaynağına güvendiğiniz JAR dosyalarını kurun; bir Paper eklentisi sunucuda Java kodu çalıştırabilir. Bu komut JAR'ı canlı olarak yüklemez, güvenli şekilde dosyaya indirir; çalışması için yeniden başlatma gerekir. Render tarafındaki kopya da katalogda kalır.
