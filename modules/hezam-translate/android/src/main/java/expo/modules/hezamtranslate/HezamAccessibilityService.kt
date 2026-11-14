package expo.modules.hezamtranslate

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * The accessibility service behind "phone control". It does nothing on its own:
 * HezamPhoneModule calls into it only while the user is running an agent task.
 */
class HezamAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Screen content is read on demand, not by listening to events.
  }

  override fun onInterrupt() {
  }

  override fun onUnbind(intent: Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  companion object {
    @Volatile
    var instance: HezamAccessibilityService? = null
  }
}
