plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.quivicino.distributori"
    compileSdk = 35

    defaultConfig {
        applicationId = "it.quivicino.distributori"
        minSdk = 26
        targetSdk = 35
        // Il workflow di GitHub passa il numero dell'esecuzione: ogni build ha un numero nuovo.
        versionCode = (System.getenv("NUMERO_BUILD") ?: "1").toInt()
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(project(":core"))
    implementation("androidx.car.app:app:1.4.0")
}
