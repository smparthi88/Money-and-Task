plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
val runNo = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
android {
    namespace = "com.parthiban.moneytasks"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.parthiban.moneytasks"
        minSdk = 24
        targetSdk = 34
        versionCode = runNo
        versionName = "1.0.$runNo"
    }
    val ksPass = System.getenv("KS_PASS")
    signingConfigs {
        if (ksPass != null) create("release") {
            storeFile = file(System.getenv("KS_PATH") ?: "release.jks")
            storePassword = ksPass
            keyAlias = "moneytasks"
            keyPassword = ksPass
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (ksPass != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
