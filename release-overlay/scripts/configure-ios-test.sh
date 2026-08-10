#!/usr/bin/env bash
set -euo pipefail

app_root="${1:-.}"
target_name="SNAPEBTGroceryTrackerQA"
plist_path="$app_root/ios/$target_name/Info.plist"
skad_ids_path="$app_root/ios/skadnetwork-ids.txt"
icon_b64_path="$app_root/assets/app-icon.png.base64"
asset_root="$app_root/ios/$target_name/Images.xcassets"
plist_buddy="/usr/libexec/PlistBuddy"

test_app_id="ca-app-pub-3940256099942544~1458002511"

if [[ ! -f "$plist_path" || ! -f "$skad_ids_path" || ! -f "$icon_b64_path" ]]; then
  echo "Required iOS test-release inputs are missing." >&2
  exit 1
fi

"$plist_buddy" -c "Set :CFBundleDisplayName SNAP-EBT & WIC Tracker QA" "$plist_path"
"$plist_buddy" -c "Set :GADApplicationIdentifier $test_app_id" "$plist_path"
"$plist_buddy" -c "Delete :NSUserTrackingUsageDescription" "$plist_path" 2>/dev/null || true
"$plist_buddy" -c "Delete :WKAppBoundDomains" "$plist_path" 2>/dev/null || true
"$plist_buddy" -c "Delete :SKAdNetworkItems" "$plist_path" 2>/dev/null || true
"$plist_buddy" -c "Add :SKAdNetworkItems array" "$plist_path"

skad_index=0
while IFS= read -r skad_id; do
  [[ -n "$skad_id" ]] || continue
  "$plist_buddy" -c "Add :SKAdNetworkItems:$skad_index dict" "$plist_path"
  "$plist_buddy" -c "Add :SKAdNetworkItems:$skad_index:SKAdNetworkIdentifier string $skad_id" "$plist_path"
  skad_index=$((skad_index + 1))
done < "$skad_ids_path"

decoded_icon="$RUNNER_TEMP/snap-ebt-wic-app-icon.png"
/usr/bin/base64 -D < "$icon_b64_path" > "$decoded_icon"
/usr/bin/sips -s format png "$decoded_icon" \
  --out "$app_root/assets/icon.png" >/dev/null
/usr/bin/sips -s format png "$decoded_icon" \
  --out "$app_root/assets/splash-icon.png" >/dev/null
/usr/bin/sips -s format png "$decoded_icon" \
  --out "$asset_root/AppIcon.appiconset/App-Icon-1024x1024@1x.png" >/dev/null
/usr/bin/sips -z 176 176 "$decoded_icon" \
  --out "$asset_root/SplashScreenLogo.imageset/image.png" >/dev/null
/usr/bin/sips -z 352 352 "$decoded_icon" \
  --out "$asset_root/SplashScreenLogo.imageset/image@2x.png" >/dev/null
/usr/bin/sips -z 528 528 "$decoded_icon" \
  --out "$asset_root/SplashScreenLogo.imageset/image@3x.png" >/dev/null

echo "Configured official Google test app ID, $skad_index SKAdNetwork IDs, and release artwork."
