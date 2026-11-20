package fr.rembobine.app;

/**
 * Le FileProvider des mises à jour (manifeste : autorité « fr.rembobine.app.maj », dossier cache/maj seulement).
 * Une classe à nous, sans rien de plus que celle d'AndroidX : la bibliothèque de Godot déclare déjà un provider
 * « androidx.core.content.FileProvider » (autorité …fileprovider). Deux providers du même nom de classe, Android
 * les prend pour le même élément au moment de fusionner les manifestes et la fabrication de l'APK s'arrête.
 * Avec ce nom-ci, les deux existent côte à côte ; getUriForFile(…, getPackageName() + ".maj", …) le trouve par
 * son autorité.
 */
public class MajFichiers extends androidx.core.content.FileProvider {
}
