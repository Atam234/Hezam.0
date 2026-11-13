package expo.modules.hezamtranslate

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

private val GGUF_MAGIC = byteArrayOf('G'.code.toByte(), 'G'.code.toByte(), 'U'.code.toByte(), 'F'.code.toByte())

/**
 * Copies a GGUF model the user picked (a content:// URI) into the app's own storage.
 * Runs on a background thread and streams the file, so multi-gigabyte models neither
 * freeze the app nor have to fit in memory.
 */
class HezamFilesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HezamFiles")

    AsyncFunction("importGguf") { fromUri: String, toFileUri: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_HEZAM_FILES", "The app is not ready yet. Try again.", null)
      val targetPath = Uri.parse(toFileUri).path
        ?: throw CodedException("ERR_HEZAM_FILES", "Invalid destination.", null)
      val target = File(targetPath)
      target.parentFile?.mkdirs()

      try {
        val input = context.contentResolver.openInputStream(Uri.parse(fromUri))
          ?: throw CodedException("ERR_HEZAM_FILES", "Could not open the selected file.", null)
        input.use { source ->
          val head = ByteArray(GGUF_MAGIC.size)
          var read = 0
          while (read < head.size) {
            val n = source.read(head, read, head.size - read)
            if (n < 0) break
            read += n
          }
          if (read < head.size || !head.contentEquals(GGUF_MAGIC)) {
            throw CodedException("ERR_HEZAM_NOT_GGUF", "The selected file is not a valid GGUF model.", null)
          }
          FileOutputStream(target).use { out ->
            out.write(head)
            val buffer = ByteArray(1 shl 20)
            while (true) {
              val n = source.read(buffer)
              if (n < 0) break
              out.write(buffer, 0, n)
            }
          }
        }
      } catch (e: Throwable) {
        target.delete()
        if (e is CodedException) throw e
        throw CodedException("ERR_HEZAM_FILES", e.message ?: "Copying the model failed.", e)
      }
      target.length().toDouble()
    }
  }
}
