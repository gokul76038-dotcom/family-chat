FAMILY CHAT - SETUP

1) Firebase Console (console.firebase.google.com):
   - Build > Authentication > Get started > Sign-in method > Email/Password = Enable
   - Build > Firestore Database > Create database (production mode) > Rules tab > paste firestore.rules > Publish
   - Build > Storage > Get started > Rules tab > paste storage.rules > Publish
     (Storage-க்கு Firebase "Blaze" plan கேட்கலாம். Free quota உள்ளதால சாதாரண பயன்பாட்டுக்கு கட்டணம் வராது)
   - Project settings > Your apps > Add app > Web (</>) > firebaseConfig values copy

2) www/firebase-config.js ஃபைல்ல PASTE_HERE இடத்துல அந்த values ஒட்டுங்க.

3) இந்த folder-ல இருக்கும் எல்லா ஃபைல்களையும் (.github folder உட்பட) GitHub repo-ல upload பண்ணுங்க (main branch).

4) GitHub repo > Actions tab > "Build APK" run முடிஞ்சதும் (5-10 நிமிஷம்) > கீழ Artifacts > family-chat-apk டவுன்லோடு > unzip > app-debug.apk.

5) ரெண்டு போன்லயும் APK இன்ஸ்டால் பண்ணுங்க (Unknown sources அனுமதி கொடுங்க). ஒவ்வொருத்தரும் தங்களுக்கு தனி User ID + Password உருவாக்குங்க.
