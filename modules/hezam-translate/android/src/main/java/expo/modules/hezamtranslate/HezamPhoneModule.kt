package expo.modules.hezamtranslate

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.net.Uri
import android.os.Build
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

  /** Visible text of an element: what it shows plus its accessibility label. */
  private fun label(node: AccessibilityNodeInfo): String {
    val text = node.text?.toString() ?: ""
    val description = node.contentDescription?.toString() ?: ""
    return if (description.isBlank()) text else if (text.isBlank()) description else "$text $description"
  }

  private fun findAll(
    node: AccessibilityNodeInfo?,
    out: MutableList<AccessibilityNodeInfo>,
    depth: Int,
    limit: Int,
    match: (AccessibilityNodeInfo) -> Boolean
  ) {
    if (node == null || out.size >= limit || depth > MAX_DEPTH) return
    if (node.isVisibleToUser && match(node)) out.add(node)
    for (i in 0 until node.childCount) {
      findAll(node.getChild(i), out, depth + 1, limit, match)
    }
  }

  private fun findApp(pm: PackageManager, name: String): ResolveInfo? {
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val apps = pm.queryIntentActivities(launcher, 0)
    val query = name.trim().lowercase()
    return apps.firstOrNull { it.loadLabel(pm).toString().lowercase() == query }
      ?: apps.firstOrNull { it.loadLabel(pm).toString().lowercase().contains(query) }
      ?: apps.firstOrNull { it.activityInfo.packageName.lowercase() == query }
  }

  /** The text box to type into: the focused one, or else the first one on screen. */
  private fun inputBox(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    if (focused != null && focused.isEditable) return focused
    val found = ArrayList<AccessibilityNodeInfo>()
    findAll(root, found, 0, 1) { it.isEditable }
    return found.firstOrNull()
  }

  private fun pressImeEnter(node: AccessibilityNodeInfo): Boolean {
    if (Build.VERSION.SDK_INT < 30) return false
    return node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
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
      val match = findApp(pm, name) ?: throw phoneError("No installed app matches \"$name\".")
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

    // Taps whatever on screen shows the given words, e.g. a button labelled "Play".
    AsyncFunction("tapText") { text: String ->
      val svc = service()
      val query = text.trim().lowercase()
      if (query.isEmpty()) throw phoneError("Say what to tap.")
      val found = ArrayList<AccessibilityNodeInfo>()
      findAll(svc.rootInActiveWindow, found, 0, 40) { !it.isEditable && label(it).lowercase().contains(query) }
      val target = found.firstOrNull { label(it).trim().lowercase() == query }
        ?: found.minByOrNull { label(it).length }
        ?: throw phoneError("Nothing on screen says \"$text\".")
      if (!click(svc, target)) throw phoneError("\"$text\" could not be tapped.")
      label(target).trim().take(60)
    }

    // Types into the focused text box, or the first one on screen. Resolves "no-input"
    // when the screen has no text box, "submitted" when Enter was pressed too.
    AsyncFunction("typeAuto") { text: String, submit: Boolean ->
      val svc = service()
      val root = svc.rootInActiveWindow ?: throw phoneError("The screen cannot be read right now.")
      val input = inputBox(root)
      if (input == null) {
        "no-input"
      } else {
        input.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle()
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        if (!input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
          throw phoneError("The text box did not accept the text.")
        }
        if (!submit) {
          "typed"
        } else if (pressImeEnter(input)) {
          "submitted"
        } else {
          "typed-not-submitted"
        }
      }
    }

    AsyncFunction<Boolean>("pressEnter") {
      val svc = service()
      val root = svc.rootInActiveWindow
      val input = if (root == null) null else inputBox(root)
      if (input == null) false else pressImeEnter(input)
    }

    // Taps the search icon or search field of the current app, to bring up its search box.
    AsyncFunction<Boolean>("tapSearch") {
      val svc = service()
      val found = ArrayList<AccessibilityNodeInfo>()
      findAll(svc.rootInActiveWindow, found, 0, 10) { node ->
        val id = node.viewIdResourceName?.lowercase() ?: ""
        val words = label(node).lowercase()
        words.contains("search") || words.contains("hanap") || id.contains("search")
      }
      val target = found.firstOrNull()
      if (target == null) false else click(svc, target)
    }

    // Taps the first item below the top bar that mentions the query: the first search result.
    AsyncFunction("tapFirstResult") { query: String ->
      val svc = service()
      val words = query.lowercase().split(' ').filter { it.length >= 3 }
      val minTop = (svc.resources.displayMetrics.heightPixels * 0.14f).toInt()
      val found = ArrayList<AccessibilityNodeInfo>()
      findAll(svc.rootInActiveWindow, found, 0, 60) { node ->
        if (node.isEditable) {
          false
        } else {
          val bounds = Rect()
          node.getBoundsInScreen(bounds)
          val words2 = label(node).lowercase()
          bounds.top > minTop && words2.length > 8 && (words.isEmpty() || words.any { words2.contains(it) })
        }
      }
      val target = found.firstOrNull() ?: throw phoneError("No result for \"$query\" is on screen yet.")
      if (!click(svc, target)) throw phoneError("The first result could not be tapped.")
      label(target).trim().take(80)
    }

    // Asks a music app to find and play something (Android's standard "play from search").
    AsyncFunction("playFromSearch") { query: String, app: String ->
      val ctx = context()
      val intent = Intent("android.media.action.MEDIA_PLAY_FROM_SEARCH")
      intent.putExtra("query", query)
      intent.putExtra("android.intent.extra.focus", "vnd.android.cursor.item/*")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (app.isNotBlank()) {
        val match = findApp(ctx.packageManager, app) ?: throw phoneError("No installed app matches \"$app\".")
        intent.setPackage(match.activityInfo.packageName)
      }
      val starter: Context = HezamAccessibilityService.instance ?: ctx
      try {
        starter.startActivity(intent)
      } catch (e: ActivityNotFoundException) {
        throw phoneError("No music app on this phone can play from a search.")
      }
      true
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
