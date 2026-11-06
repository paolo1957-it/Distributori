import UIKit

/// Le due "scene" dell'app sono dichiarate in Info.plist (UIApplicationSceneManifest):
/// TelefonoSceneDelegate per lo schermo dell'iPhone, CarPlaySceneDelegate per l'auto.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        true
    }
}
