package expo.modules.hezamtranslate

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ERROR_CODE = "ERR_HEZAM_TRANSLATE"

/**
 * Thin wrapper over Google ML Kit Translation. Language packs are downloaded once
 * (about 30 MB each) and translation then runs fully on the device.
 */
class HezamTranslateModule : Module() {
  private val translators = HashMap<String, Translator>()

  private fun translatorFor(source: String, target: String): Translator = synchronized(translators) {
    translators.getOrPut("$source>$target") {
      Translation.getClient(
        TranslatorOptions.Builder()
          .setSourceLanguage(source)
          .setTargetLanguage(target)
          .build()
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("HezamTranslate")

    AsyncFunction("isModelDownloaded") { language: String, promise: Promise ->
      val model = TranslateRemoteModel.Builder(language).build()
      RemoteModelManager.getInstance().isModelDownloaded(model)
        .addOnSuccessListener { downloaded -> promise.resolve(downloaded == true) }
        .addOnFailureListener { e -> promise.reject(ERROR_CODE, e.message, e) }
    }

    AsyncFunction("downloadModel") { language: String, promise: Promise ->
      val model = TranslateRemoteModel.Builder(language).build()
      RemoteModelManager.getInstance().download(model, DownloadConditions.Builder().build())
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { e -> promise.reject(ERROR_CODE, e.message, e) }
    }

    AsyncFunction("translate") { text: String, source: String, target: String, promise: Promise ->
      translatorFor(source, target).translate(text)
        .addOnSuccessListener { translated -> promise.resolve(translated ?: "") }
        .addOnFailureListener { e -> promise.reject(ERROR_CODE, e.message, e) }
    }

    OnDestroy {
      synchronized(translators) {
        translators.values.forEach { it.close() }
        translators.clear()
      }
    }
  }
}
