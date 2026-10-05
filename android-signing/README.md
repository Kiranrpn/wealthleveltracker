# Debug signing key

`debug.keystore` is a fixed Android **debug** key (store and key password: `android`,
alias: `androiddebugkey`). The APK workflow copies it to `~/.android/debug.keystore`
before building.

Why it is committed: every APK must be signed with the same key, or Android refuses to
install a new build over the old one. You would have to uninstall first, and that erases
all data stored in the app. A fixed key means new builds install as updates and your data
stays.

It is a debug key, not a secret: anyone with this repo can sign an APK with it. That is
fine for a personal sideloaded app. Before publishing on the Play Store, create a private
release key and store it in GitHub Actions secrets instead.
