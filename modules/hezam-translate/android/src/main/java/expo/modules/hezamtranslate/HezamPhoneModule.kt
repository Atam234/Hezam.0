package expo.modules.hezamtranslate

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityNodeInfo
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MAX_NODES = 90
private const val MAX_DEPTH = 40

private fun phoneError(message: String): CodedException = CodedException("ERR_HEZAM_PHONE", message, null)

/**
 * Phone control for the agent: open apps, read the current screen as a numbered list
 * of elements, and tap, type, scroll or press system buttons. Everything except
 * opening apps and links needs the accessibility service to be enabled by the user.
 */
class HezamPhoneModule : Module() {
  /** Elements from the last readScreen call; the agent refers to them by index. */
  @Volatile
  private var lastNodes: List<AccessibilityNodeInfo> = emptyList()

  private fun context(): Context =
    appContext.reactContext ?: throw phoneError("The app is not ready yet. Try again.")

  private fun service(): HezamAccessibilityService =
    HezamAccessibilityService.instance
      ?: throw phoneError("Phone control is off. Turn on Hezam.0 phone control in Accessibility settings.")

  private fun collect(node: AccessibilityNodeInfo?, out: MutableList<AccessibilityNodeInfo>, depth: Int) {
    if (node == null || out.size >= MAX_NODES || depth > MAX_DEPTH) return
    if (node.isVisibleToUser) {
      val labelled = !node.text.isNullOrBlank() || !node.contentDescription.isNullOrBlank()
      if (labelled || node.isClickable || node.isEditable) out.add(node)
    }
    for (i in 0 until node.childCount) {
      collect(node.getChild(i), out, depth + 1)
    }
  }

  private fun describe(packageName: String, nodes: List<AccessibilityNodeInfo>): String {
    val sb = StringBuilder()
    sb.append("app: ").append(packageName).append('\n')
    nodes.forEachIndexed { index, node ->
      val type = node.className?.toString()?.substringAfterLast('.') ?: "View"
      sb.append('[').append(index).append("] ").append(type)
      val text = node.text?.toString()
      if (!text.isNullOrBlank()) {
        sb.append(" \"").append(text.take(80).replace('\n', ' ')).append('"')
      }
      val label = node.contentDescription?.toString()
      if (!label.isNullOrBlank()) {
        sb.append(" (").append(label.take(60).replace('\n', ' ')).append(')')
      }
      if (node.isClickable) sb.append(" clickable")
      if (node.isEditable) sb.append(" editable")
      if (node.isScrollable) sb.append(" scrollable")
      sb.append('\n')
    }
    if (nodes.isEmpty()) sb.append("(nothing readable on this screen)\n")
    return sb.toString()
  }

  private fun gesture(svc: AccessibilityService, path: Path, durationMs: Long): Boolean {
    val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
    return svc.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
  }

  private fun click(svc: AccessibilityService, node: AccessibilityNodeInfo): Boolean {
    // Prefer a real click on the element or the nearest clickable parent.
    var current: AccessibilityNodeInfo? = node
    var hops = 0
    while (current != null && hops < 6) {
      if (current.isClickable && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
      current = current.parent
      hops++
    }
    // Otherwise tap the middle of the element.
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.isEmpty) return false
    val path = Path()
    path.moveTo(bounds.exactCenterX(), bounds.exactCenterY())
    return gesture(svc, path, 60L)
  }

  private fun nodeAt(index: Int): AccessibilityNodeInfo {
    val nodes = lastNodes
    if (index < 0 || index >= nodes.size) {
      throw phoneError("There is no element [$index]. Read the screen again and use an index from that list.")
    }
    return nodes[index]
  }

  private fun findScrollable(node: AccessibilityNodeInfo?, depth: Int): AccessibilityNodeInfo? {
    if (node == null || depth > MAX_DEPTH) return null
    if (node.isScrollable && node.isVisibleToUser) return node
    for (i in 0 until node.childCount) {
      val found = findScrollable(node.getChild(i), depth + 1)
      if (found != null) return found
    }
    return null
  }

  override fun definition() = ModuleDefinition {
    Name("HezamPhone")

    AsyncFunction<Boolean>("isControlEnabled") {
      HezamAccessibilityService.instance != null
    }

    AsyncFunction<Boolean>("openAccessibilitySettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context().startActivity(intent)
      true
    }

    AsyncFunction<List<String>>("listApps") {
      val pm = context().packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.loadLabel(pm).toString() }
        .distinct()
        .sorted()
    }

    AsyncFunction("openApp") { name: String ->
      val ctx = context()
      val pm = ctx.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val apps = pm.queryIntentActivities(launcher, 0)
      val query = name.trim().lowercase()
      val match = apps.firstOrNull { it.loadLabel(pm).toString().lowercase() == query }
        ?: apps.firstOrNull { it.loadLabel(pm).toString().lowercase().contains(query) }
        ?: apps.firstOrNull { it.activityInfo.packageName.lowercase() == query }
        ?: throw phoneError("No installed app matches \"$name\".")
      val intent = pm.getLaunchIntentForPackage(match.activityInfo.packageName)
        ?: throw phoneError("\"$name\" cannot be opened.")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      // Starting from the accessibility service still works while Hezam.0 is in the background.
      val starter: Context = HezamAccessibilityService.instance ?: ctx
      starter.startActivity(intent)
      match.loadLabel(pm).toString()
    }

    AsyncFunction("openUrl") { url: String ->
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val starter: Context = HezamAccessibilityService.instance ?: context()
      starter.startActivity(intent)
      true
    }

    AsyncFunction<String>("readScreen") {
      val svc = service()
      val root = svc.rootInActiveWindow ?: throw phoneError("The screen cannot be read right now.")
      val nodes = ArrayList<AccessibilityNodeInfo>()
      collect(root, nodes, 0)
      lastNodes = nodes
      describe(root.packageName?.toString() ?: "unknown", nodes)
    }

    AsyncFunction("tap") { index: Int ->
      val svc = service()
      if (!click(svc, nodeAt(index))) throw phoneError("Element [$index] could not be tapped.")
      true
    }

    AsyncFunction("typeText") { index: Int, text: String ->
      service()
      val node = nodeAt(index)
      val args = Bundle()
      args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
      if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
        throw phoneError("Element [$index] does not accept text. Pick an element marked editable.")
      }
      true
    }

    AsyncFunction("scroll") { direction: String ->
      val svc = service()
      val down = direction.trim().lowercase() != "up"
      val scrollable = findScrollable(svc.rootInActiveWindow, 0)
      val action = if (down) {
        AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
      } else {
        AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
      }
      if (scrollable != null && scrollable.performAction(action)) {
        true
      } else {
        val metrics = svc.resources.displayMetrics
        val x = metrics.widthPixels / 2f
        val from = metrics.heightPixels * (if (down) 0.72f else 0.28f)
        val to = metrics.heightPixels * (if (down) 0.28f else 0.72f)
        val path = Path()
        path.moveTo(x, from)
        path.lineTo(x, to)
        gesture(svc, path, 300L)
      }
    }

    AsyncFunction("pressButton") { button: String ->
      val svc = service()
      val action = when (button.trim().lowercase()) {
        "back" -> AccessibilityService.GLOBAL_ACTION_BACK
        "home" -> AccessibilityService.GLOBAL_ACTION_HOME
        "recents" -> AccessibilityService.GLOBAL_ACTION_RECENTS
        "notifications" -> AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
        else -> throw phoneError("Unknown button \"$button\". Use back, home, recents or notifications.")
      }
      svc.performGlobalAction(action)
    }
  }
}
