package expo.modules.richpaste

import android.content.Context
import android.net.Uri
import android.view.View
import android.webkit.MimeTypeMap
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * C80 Rev.1 — klavyenin kendi panosundan (Gboard "Pano" bölmesi, ekran görüntüsü önerisi) görsel yapıştırma.
 *
 * Neden native: Gboard ekran görüntüsünü SİSTEM panosuna değil kendi geçmişine koyuyor ve görseli yalnız mesaj
 * kutusu "görsel kabul ederim" derse (`EditorInfo.contentMimeTypes`) gönderiyor. React Native'in `TextInput`ı
 * bunu söylemiyor, klavye de "uygulama resim yapıştırmayı desteklemiyor" diyor.
 *
 * Çözüm: kutunun native görünümüne `ViewCompat.setOnReceiveContentListener` (yalnız görsel türleri). AppCompat/Android bununla
 * `contentMimeTypes`ı kendisi ilan eder ve klavyenin `commitContent`ini dinleyiciye getirir. Görsel önbelleğe
 * kopyalanır (klavyenin verdiği URI izni geçicidir), yolu JS'e olayla gider; JS mevcut ek hunisine sokar
 * (tür/boyut/sayı süzgeci, sunucu otorite). Metin yapıştırma DEĞİŞMEZ: görsel olmayan kısım varsayılan işleyiciye döner.
 */
class RichPasteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RichPaste")
    Events("onImage")

    AsyncFunction("attach") { viewTag: Int ->
      val view = appContext.findView<View>(viewTag) ?: return@AsyncFunction false
      ViewCompat.setOnReceiveContentListener(view, MIME_TYPES) { v, payload -> receive(v, viewTag, payload) }
      true
    }.runOnQueue(Queues.MAIN)
  }

  private fun receive(view: View, viewTag: Int, payload: ContentInfoCompat): ContentInfoCompat? {
    val split = payload.partition { item -> item.uri != null }
    val images = split.first ?: return payload
    val context = view.context
    val clip = images.clip
    for (i in 0 until clip.itemCount) {
      val uri = clip.getItemAt(i).uri ?: continue
      val mime = context.contentResolver.getType(uri) ?: clip.description.getMimeType(0) ?: "image/png"
      if (!mime.startsWith("image/")) continue
      // İzin dinleyici dönünce bırakılabilir: kopya burada, ana iş parçacığında (ekran görüntüsü ~1-3 MB).
      val file = copyToCache(context, uri, mime) ?: continue
      sendEvent(
        "onImage",
        mapOf("viewTag" to viewTag, "uri" to Uri.fromFile(file).toString(), "mimeType" to mime),
      )
    }
    return split.second
  }

  private fun copyToCache(context: Context, uri: Uri, mime: String): File? = try {
    val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "png"
    val out = File(context.cacheDir, "pano-${System.currentTimeMillis()}.$ext")
    context.contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
    if (out.length() > 0) out else null
  } catch (e: Exception) {
    null
  }

  companion object {
    private val MIME_TYPES = arrayOf("image/*")
  }
}
