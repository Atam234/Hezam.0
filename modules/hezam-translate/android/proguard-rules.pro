# The release build is shrunk by R8. ML Kit finds its components (including the translation
# model manager) by reflection from manifest entries, and its native library calls back into
# Java by name, so these classes must not be removed or renamed. Without this, calls fail at
# runtime with a NullPointerException inside ML Kit.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit** { *; }
-keep class com.google.firebase.components.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
-keepnames class com.google.android.gms.common.internal.** { *; }

# Android starts the accessibility service by the class name written in the manifest.
-keep class expo.modules.hezamtranslate.HezamAccessibilityService { *; }
