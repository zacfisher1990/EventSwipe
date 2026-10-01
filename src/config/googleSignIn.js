// OAuth client IDs for Google sign-in (public identifiers, not secrets).
// From the Firebase project once the Google provider is enabled:
//   WEB_CLIENT_ID — "Web client (auto created by Google Service)"; client_type 3
//                   in android/app/google-services.json
//   IOS_CLIENT_ID — CLIENT_ID in the iOS app's GoogleService-Info.plist. Its
//                   reversed form must also be a URL scheme in ios/EventSwipe/Info.plist.
// While WEB_CLIENT_ID is empty the Google button is hidden.
export const WEB_CLIENT_ID = '';
export const IOS_CLIENT_ID = '';
