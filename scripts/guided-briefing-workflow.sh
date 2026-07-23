#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/guided-briefing-workflow.sh
  scripts/guided-briefing-workflow.sh briefings/YYYY-MM-DD
  scripts/guided-briefing-workflow.sh YYYY-MM-DD
  scripts/guided-briefing-workflow.sh /mnt/c/.../briefings/YYYY-MM-DD
  scripts/guided-briefing-workflow.sh 'C:\...\briefings\YYYY-MM-DD'

This is an interactive checklist runner for a daily Radar Beirut briefing folder.
It verifies the corrected briefing source and image assets, then guides you
through handoff generation, Codex/editorial JSON filling, build, review, timing,
final HTML generation, muted MP4 rendering, narration audio muxing, and scene
splitting.

After final HTML/audio generation, the workflow attempts to rsync the briefing
folder to the render server. If the server is unavailable, the workflow prints
the connection issue and continues to the Windows/local render step.

With no argument, the script defaults to today's project-local briefing folder:
  briefings/YYYY-MM-DD
USAGE
}

die() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

pause_for_user() {
  local message="$1"
  printf '\n%s\n' "$message"
  read -r -p "Press Enter when done/validated..."
}

windows_to_wsl_path() {
  local input="$1"

  node -e "const input = process.argv[1]; const match = input.match(/^([a-zA-Z]):[\\\\/](.*)$/); if (!match) { console.log(input); process.exit(0); } const drive = match[1].toLowerCase(); const rest = match[2].replace(/\\\\/g, '/'); console.log('/mnt/' + drive + '/' + rest);" "$input"
}

default_project_briefing_folder() {
  local date_label
  date_label="$(date +%F)"
  printf 'briefings/%s\n' "$date_label"
}

absolute_path() {
  local input="$1"
  local dir
  dir="$(cd "$(dirname "$input")" && pwd -P)"
  printf '%s/%s\n' "$dir" "$(basename "$input")"
}

resolve_folder() {
  local input="$1"
  local candidate

  candidate="$(windows_to_wsl_path "$input")"

  if [[ -d "$candidate" ]]; then
    absolute_path "$candidate"
    return
  fi

  if [[ -d "briefings/$candidate" ]]; then
    absolute_path "briefings/$candidate"
    return
  fi

  die "Briefing folder does not exist: $input"
}

is_date_label() {
  local input="$1"
  [[ "$input" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

infer_date_label() {
  local folder="$1"
  local folder_name
  folder_name="$(basename "$folder")"

  if is_date_label "$folder_name"; then
    printf '%s\n' "$folder_name"
    return
  fi

  local parent_path
  parent_path="$(dirname "$folder")"
  local parent_name
  parent_name="$(basename "$parent_path")"

  if is_date_label "$parent_name" \
    && [[ -f "$folder/briefing_${parent_name}.txt" || -f "$folder/briefing_${parent_name}_corrected.txt" ]]; then
    printf '%s\n' "$parent_name"
    return
  fi

  die "Could not infer briefing date from folder path. Expected folder name or parent folder to be YYYY-MM-DD: $folder"
}

count_paragraphs() {
  local source_file="$1"
  node -e "const fs=require('fs'); const text=fs.readFileSync(process.argv[1],'utf8').trim(); console.log(text ? text.split(/\r?\n\s*\r?\n/).map((p)=>p.trim()).filter(Boolean).length : 0);" "$source_file"
}

count_images() {
  local folder="$1"
  find "$folder" -maxdepth 1 -type f \
    \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
    ! -iname '*preview*' \
    ! -iname '*check*' \
    ! -iname 'final_summary_generated.png' \
    | wc -l \
    | tr -d ' '
}

count_unique_outlet_image_keys() {
  local folder="$1"
  find "$folder" -maxdepth 1 -type f \
    \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
    ! -iname '*preview*' \
    ! -iname '*check*' \
    ! -iname 'final_summary_generated.png' \
    -printf '%f\n' \
    | awk -F '_' 'NF > 1 && $1 != "" {print $1}' \
    | sort -u \
    | wc -l \
    | tr -d ' '
}

list_images() {
  local folder="$1"
  find "$folder" -maxdepth 1 -type f \
    \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
    ! -iname '*preview*' \
    ! -iname '*check*' \
    ! -iname 'final_summary_generated.png' \
    | sort
}

list_unique_outlet_image_keys() {
  local folder="$1"
  find "$folder" -maxdepth 1 -type f \
    \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
    ! -iname '*preview*' \
    ! -iname '*check*' \
    ! -iname 'final_summary_generated.png' \
    -printf '%f\n' \
    | awk -F '_' 'NF > 1 && $1 != "" {print $1}' \
    | sort -u
}

move_stale_closing_audio_if_needed() {
  local folder="$1"
  local output_folder="$2"
  local stale_audio

  stale_audio="$(
    node -e "
const fs = require('fs');
const path = require('path');
const folder = process.argv[1];
const outputFolder = process.argv[2];
const briefingPath = path.join(outputFolder, 'briefing.json');
const manifestPath = path.join(folder, 'audio', 'manifest.json');
if (!fs.existsSync(briefingPath) || !fs.existsSync(manifestPath)) process.exit(0);
const briefing = JSON.parse(fs.readFileSync(briefingPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const suffix = '... وهيك منوصل لسؤال اليوم';
const legacySuffix = '.. ... وهيك منوصل لسؤال اليوم';
const withQuestionHandoffSuffix = (text) => {
  let normalized = normalize(text);
  if (!normalized) return normalized;
  for (const item of [legacySuffix, suffix]) {
    if (normalized.endsWith(item)) {
      normalized = normalize(normalized.slice(0, -item.length));
      break;
    }
  }
  return normalize(normalized.replace(/(?:\s*[.…]{2,})+$/u, '')) + ' ' + suffix;
};
const scenes = briefing.scenes || [];
const closingScene = briefing.outro && scenes.length ? scenes[scenes.length - 1] : null;
const closingEntry = closingScene ? (manifest.entries || []).find((entry) => entry.sceneId === closingScene.id) : null;
const overridesPath = path.join(folder, 'audio', 'text-overrides.json');
const rawOverrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
const overrides = rawOverrides && rawOverrides.overrides && typeof rawOverrides.overrides === 'object' ? rawOverrides.overrides : rawOverrides;
const overrideEntry = closingScene ? overrides[closingScene.id] : null;
const overrideText = normalize(typeof overrideEntry === 'string' ? overrideEntry : overrideEntry && overrideEntry.text);
const expectedAudioText = withQuestionHandoffSuffix(overrideText || (closingScene && (closingScene.audioText || closingScene.body)));
const manifestText = normalize(closingEntry && closingEntry.text);
if (!closingScene || !closingEntry || expectedAudioText === manifestText || !closingEntry.audioPath) process.exit(0);
const audioPath = path.resolve(process.cwd(), closingEntry.audioPath);
if (!fs.existsSync(audioPath)) process.exit(0);
const backupPath = path.join(path.dirname(audioPath), path.basename(audioPath, path.extname(audioPath)) + '.stale-before-regeneration' + path.extname(audioPath));
console.log(audioPath + '\t' + backupPath + '\t' + closingScene.id);
" "$folder" "$output_folder"
  )"

  if [[ -z "$stale_audio" ]]; then
    return
  fi

  local audio_path backup_path
  audio_path="${stale_audio%%$'\t'*}"
  local remainder="${stale_audio#*$'\t'}"
  backup_path="${remainder%%$'\t'*}"
  local closing_scene_id="${remainder#*$'\t'}"

  printf '\nDetected stale closing-scene audio after the latest briefing build.\n'
  printf 'Moving old WAV aside so Hamsa regenerates %s from the summary-only audio text:\n' "$closing_scene_id"
  printf '  %s\n  -> %s\n' "$audio_path" "$backup_path"
  mv "$audio_path" "$backup_path"
}

capture_article_screenshots_if_needed() {
  local folder="$1"
  local -a known_outlets=("asasmedia" "almodon")

  for outlet in "${known_outlets[@]}"; do
    local -a existing_files=()
    while IFS= read -r f; do
      [[ -n "$f" ]] && existing_files+=("$f")
    done < <(find "$folder" -maxdepth 1 -type f \
      \( -iname "${outlet}_article_*.jpg" \
         -o -iname "${outlet}_article_*.jpeg" \
         -o -iname "${outlet}_article_*.png" \) \
      2>/dev/null | sort)

    if [[ ${#existing_files[@]} -gt 0 ]]; then
      printf '\n%s article screenshots already present:\n' "$outlet"
      for f in "${existing_files[@]}"; do
        printf '  %s\n' "$(basename "$f")"
      done
      continue
    fi

    printf '\nNo article screenshots found for %s.\n' "$outlet"
    printf 'Enter article URLs for %s (semicolon-separated), or press Enter to skip:\n> ' "$outlet"
    read -r urls_input

    [[ -z "${urls_input// /}" ]] && { printf 'Skipping %s.\n' "$outlet"; continue; }

    local seq=1
    IFS=';' read -ra url_list <<< "$urls_input"
    for url in "${url_list[@]}"; do
      url="${url#"${url%%[! ]*}"}"
      url="${url%"${url##*[! ]}"}"
      [[ -z "$url" ]] && continue
      local out_path
      out_path="$(printf '%s/%s_article_%02d.jpg' "$folder" "$outlet" "$seq")"
      printf '\n  Capturing screenshot %d/%d for %s:\n    %s\n    → %s\n' \
        "$seq" "${#url_list[@]}" "$outlet" "$url" "$out_path"
      npm run article:screenshot -- "$url" "$out_path"
      seq=$((seq + 1))
    done
  done
}

verify_initial_assets() {
  local folder="$1"
  local date_label="$2"
  local expected_source="$folder/briefing_${date_label}.txt"
  local corrected_source="$folder/briefing_${date_label}_corrected.txt"

  while true; do
    section "Step 1: Verify Corrected Briefing And Image Assets"

    capture_article_screenshots_if_needed "$folder"

    local missing=0

    if [[ ! -f "$expected_source" ]]; then
      printf 'Missing source briefing:\n  %s\n' "$expected_source"
      missing=1
    else
      printf 'Found source briefing:\n  %s\n' "$expected_source"
    fi

    if [[ ! -f "$corrected_source" ]]; then
      printf '\nMissing corrected briefing source:\n  %s\n' "$corrected_source"
      printf 'Create this after human correction. The builders prefer the _corrected.txt file when it exists.\n'
      missing=1
    else
      printf '\nFound corrected briefing source:\n  %s\n' "$corrected_source"
    fi

    local source_for_count="$corrected_source"
    if [[ ! -f "$source_for_count" && -f "$expected_source" ]]; then
      source_for_count="$expected_source"
    fi

    local paragraph_count=0
    if [[ -f "$source_for_count" ]]; then
      paragraph_count="$(count_paragraphs "$source_for_count")"
    fi

    local image_count
    image_count="$(count_images "$folder")"
    local outlet_image_key_count
    outlet_image_key_count="$(count_unique_outlet_image_keys "$folder")"
    local required_outlet_image_count=0
    if [[ "$paragraph_count" -gt 3 ]]; then
      required_outlet_image_count=$((paragraph_count - 3))
    fi

    printf '\nDetected briefing paragraphs: %s\n' "$paragraph_count"
    printf 'Paragraphs excluded from outlet-image requirement: 3 (introduction, summary, final question)\n'
    printf 'Required unique outlet image keys: %s\n' "$required_outlet_image_count"
    printf 'Detected usable image assets in folder: %s\n' "$image_count"
    printf 'Detected unique outlet image keys: %s\n' "$outlet_image_key_count"

    if [[ "$image_count" -gt 0 ]]; then
      printf '\nUsable image assets:\n'
      list_images "$folder" | sed 's/^/  /'
    fi

    if [[ "$outlet_image_key_count" -gt 0 ]]; then
      printf '\nUnique outlet image keys:\n'
      list_unique_outlet_image_keys "$folder" | sed 's/^/  /'
    fi

    if [[ "$paragraph_count" -eq 0 ]]; then
      printf '\nCould not estimate scenes because no readable briefing text was found.\n'
      missing=1
    elif [[ "$outlet_image_key_count" -ne "$required_outlet_image_count" ]]; then
      printf '\nNeed one unique outlet image key per outlet paragraph before continuing.\n'
      printf 'Rule: unique outlet image keys must equal paragraph count - 3.\n'
      printf 'Example: aawsat_AsharqAlAwsat_2026-06-03.png -> outlet key `aawsat`.\n'
      printf 'Duplicate article screenshots such as almodon_article_01.jpg and almodon_article_02.jpg count as one outlet key.\n'
      printf 'Add or rename article screenshots in:\n  %s\n' "$folder"
      missing=1
    fi

    if [[ "$missing" -eq 0 ]]; then
      printf '\nInitial asset check passed.\n'
      return
    fi

    pause_for_user "Fix the missing files/screenshots, then come back here."
  done
}

verify_files_exist() {
  local folder="$1"
  shift

  local missing=0
  for file_name in "$@"; do
    if [[ ! -f "$folder/$file_name" ]]; then
      printf 'Missing: %s\n' "$folder/$file_name"
      missing=1
    fi
  done

  return "$missing"
}

wait_for_file() {
  local file_path="$1"
  local instruction="$2"

  while [[ ! -f "$file_path" ]]; do
    pause_for_user "$instruction"
    if [[ ! -f "$file_path" ]]; then
      printf '\nStill missing:\n  %s\n' "$file_path"
    fi
  done
}

project_relative_path() {
  local input="$1"
  local absolute
  absolute="$(absolute_path "$input")"

  case "$absolute" in
    "$PWD"/*)
      printf '%s\n' "${absolute#"$PWD"/}"
      ;;
    *)
      printf '%s\n' "$absolute"
      ;;
  esac
}

sync_briefing_to_render_server() {
  local folder="$1"
  local date_label="$2"
  local briefing_folder_for_command
  local remote_host="hassan.alhajj@10.0.10.20"
  local remote_port="2361"
  local remote_root="~/projects/simple-app/leb-news-public-artifacts"
  local remote_folder="$remote_root/briefings/$date_label"

  briefing_folder_for_command="briefings/$date_label"

  section "Step 8: Sync Briefing Folder To Render Server"

  cat <<EOF
The workflow will try to sync the complete briefing folder to the render server:
  rsync -av -e "ssh -p $remote_port" $briefing_folder_for_command/ $remote_host:$remote_folder/
EOF

  if ! command -v rsync >/dev/null 2>&1; then
    printf '\nNo rsync command found in this environment. Skipping server sync.\n'
  elif ! command -v ssh >/dev/null 2>&1; then
    printf '\nNo ssh command found in this environment. Skipping server sync.\n'
  else
    set +e
    ssh -p "$remote_port" -o ConnectTimeout=8 "$remote_host" "mkdir -p $remote_folder"
    local ssh_status=$?
    set -e

    if [[ "$ssh_status" -ne 0 ]]; then
      printf '\nNo connection to render server %s on port %s. Skipping server sync.\n' "$remote_host" "$remote_port"
    else
      set +e
      rsync -av -e "ssh -p $remote_port" "$briefing_folder_for_command/" "$remote_host:$remote_folder/"
      local rsync_status=$?
      set -e

      if [[ "$rsync_status" -ne 0 ]]; then
        printf '\nNo connection or rsync failure while syncing to render server. Continuing locally.\n'
      else
        cat <<EOF

Server sync complete.

On the server, run:
  cd ~/projects/simple-app/leb-news-public-artifacts
  npm run briefing:render:mp4 -- --folder briefings/$date_label --muted --log warn
  npm run briefing:mux:audio -- --folder briefings/$date_label

Then download the final MP4 back to:
  $folder/output/radar-beirut-briefing-final.mp4

You can also ignore the server render and run the muted render locally on Windows.
EOF
      fi
    fi
  fi

  cat <<EOF

Next continuation options:
  1. Download the server-produced final MP4 here:
     $folder/output/radar-beirut-briefing-final.mp4
  2. Or render the muted MP4 locally/Windows here:
     $folder/output/radar-beirut-briefing.mp4

The workflow will continue when either expected MP4 exists.
EOF
}

wait_for_windows_muted_render_mux_and_split() {
  local folder="$1"
  local output_folder="$2"
  local date_label="$3"
  local folder_for_command
  local server_folder_for_command
  local muted_video
  local final_video
  local split_output_dir

  folder_for_command="$(project_relative_path "$folder")"
  server_folder_for_command="briefings/$date_label"
  muted_video="$output_folder/radar-beirut-briefing.mp4"
  final_video="$output_folder/radar-beirut-briefing-final.mp4"
  split_output_dir="$output_folder/scene-videos"

  while [[ ! -f "$muted_video" && ! -f "$final_video" ]]; do
    cat <<EOF

Manual action required.

Option A: render on the synced server, then download:
  $final_video

Server commands:
  cd ~/projects/simple-app/leb-news-public-artifacts
  npm run briefing:render:mp4 -- --folder $server_folder_for_command --muted --log warn
  npm run briefing:mux:audio -- --folder $server_folder_for_command

Option B: render the muted video on Windows, then this script will mux audio here.

Open PowerShell or Command Prompt in the project folder:
  C:\Users\HassanAlhajj\Desktop\MyProjects\video-animations

Run this command (renders the VIDEO ONLY — silence is expected, narration is muxed in afterwards):
  npm run briefing:render:mp4 -- --folder $folder_for_command --muted --log warn

What to expect:
  - render defaults: 720x1280, --concurrency 12, --gl angle (GPU compositing)
  - progress lines for "Bundled code", "Rendered frames", "Encoded video"
  - "Rendered frames" is the long part: roughly 10-15 minutes for a ~7 minute briefing
  - output (silent video, unsuffixed filename):
      $muted_video

For the full-resolution final cut, add: --resolution 1080x1920
(that writes a -1080x1920 suffixed file; this workflow expects the default unsuffixed one).
EOF

    read -r -p "Press Enter after downloading the server final MP4 or finishing the Windows muted render..."

    if [[ ! -f "$muted_video" && ! -f "$final_video" ]]; then
      printf '\nStill missing both expected continuation files:\n'
      printf '  final video from server: %s\n' "$final_video"
      printf '  muted video from local/Windows render: %s\n' "$muted_video"
      printf 'Download the server final MP4 or run the Windows render command above, then try again.\n'
    fi
  done

  if [[ -f "$final_video" ]]; then
    if [[ "$output_folder/briefing.json" -nt "$final_video" ]]; then
      printf '\nWARNING: the final video is older than output/briefing.json:\n  %s\n' "$final_video"
      printf 'It may be left over from an earlier build of this folder.\n'
      pause_for_user "If it is stale, re-render on the server or locally before continuing."
    fi

    printf '\nFound final MP4 with audio:\n  %s\n' "$final_video"
    printf 'Skipping local mux step because the final video already exists.\n'
    printf '\nSplitting final MP4 (with audio) into scene videos:\n'
    printf '  npm run briefing:split:mp4 -- --folder %s --input %s --output-dir %s\n' "$folder_for_command" "$(project_relative_path "$final_video")" "$(project_relative_path "$split_output_dir")"
    npm run briefing:split:mp4 -- --folder "$folder_for_command" --input "$(project_relative_path "$final_video")" --output-dir "$(project_relative_path "$split_output_dir")"
    return
  fi

  if [[ "$output_folder/briefing.json" -nt "$muted_video" ]]; then
    printf '\nWARNING: the muted video is older than output/briefing.json:\n  %s\n' "$muted_video"
    printf 'It may be left over from an earlier build of this folder.\n'
    pause_for_user "If it is stale, re-run the Windows muted render before continuing."
  fi

  printf '\nFound muted MP4:\n  %s\n' "$muted_video"

  section "Step 9b: Mux Narration Audio Into The Muted MP4 (runs here in WSL)"
  cat <<EOF
Mixing all narration tracks (intro + outlet scenes + closing + outro) at
frame-accurate offsets computed from output/briefing.json, then attaching
them to the muted video without re-encoding frames:
  npm run briefing:mux:audio -- --folder $folder_for_command

What to expect:
  - one line per narration track showing its start offset in seconds
    (intro @ 0.000s, scene-2 @ ~7.5s, then each scene in order)
  - ffmpeg finishes in a few seconds because the video stream is copied (-c:v copy)
  - output (final video WITH audio):
      $final_video

Audio-fix shortcut for later: if you regenerate a narration WAV and it is the
SAME length or SHORTER, re-run only this mux command — no Windows re-render.
If the new WAV is LONGER, scene timings shift and the muted video must be
re-rendered on Windows first.
EOF

  npm run briefing:mux:audio -- --folder "$folder_for_command"

  if [[ ! -f "$final_video" ]]; then
    die "Mux did not produce the expected final video: $final_video"
  fi

  printf '\nSplitting final MP4 (with audio) into scene videos:\n'
  printf '  npm run briefing:split:mp4 -- --folder %s --input %s --output-dir %s\n' "$folder_for_command" "$(project_relative_path "$final_video")" "$(project_relative_path "$split_output_dir")"
  npm run briefing:split:mp4 -- --folder "$folder_for_command" --input "$(project_relative_path "$final_video")" --output-dir "$(project_relative_path "$split_output_dir")"
}

run_codex_afk() {
  local folder="$1"
  local output_folder="$folder/output"
  local prompt_path="$output_folder/codex-briefing-prompt.md"
  local final_message_path="$output_folder/codex-afk-final-message.md"

  if ! command -v codex >/dev/null 2>&1; then
    die "Codex CLI was not found in WSL. Install or expose \`codex\` in PATH before running the AFK workflow."
  fi

  if [[ ! -f "$prompt_path" ]]; then
    die "Missing generated prompt: $prompt_path"
  fi

  printf 'Running Codex AFK. This blocks until Codex finishes:\n'
  printf '  codex exec --cd %s --sandbox workspace-write --skip-git-repo-check --output-last-message %s - < %s\n' "$PWD" "$final_message_path" "$prompt_path"

  codex exec \
    --cd "$PWD" \
    --sandbox workspace-write \
    --skip-git-repo-check \
    --output-last-message "$final_message_path" \
    - < "$prompt_path"

  printf '\nCodex AFK final message:\n  %s\n' "$final_message_path"
}

print_output_duration_summary() {
  local output_folder="$1"

  node - "$output_folder" <<'NODE'
const fs = require('fs');
const path = require('path');

const outputFolder = process.argv[2];

const readJson = (fileName) => {
  const filePath = path.join(outputFolder, fileName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const duration = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const sumDurations = (items) => (items || []).reduce((sum, item) => sum + duration(item.durationSeconds), 0);
const formatClock = (seconds) => {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const rows = [];

const briefing = readJson('briefing.json');
if (briefing) {
  rows.push({
    label: 'full editorial content',
    fileName: 'radar-beirut-briefing.html',
    seconds: duration(briefing.intro?.durationSeconds) + sumDurations(briefing.scenes) + duration(briefing.outro?.durationSeconds)
  });
}

const quoteDuel = readJson('quote-duel.json');
if (quoteDuel) {
  rows.push({
    label: 'The Quote Duel',
    fileName: 'radar-beirut-quote-duel.html',
    seconds: duration(quoteDuel.intro?.durationSeconds) + sumDurations(quoteDuel.scenes) + duration(quoteDuel.outro?.durationSeconds)
  });
}

const faultLineMap = readJson('fault-line-map.json');
if (faultLineMap) {
  rows.push({
    label: 'Fault Line Map',
    fileName: 'radar-beirut-fault-line-map.html',
    seconds: duration(faultLineMap.intro?.durationSeconds) + sumDurations(faultLineMap.entries) + duration(faultLineMap.synthesis?.durationSeconds) + duration(faultLineMap.outro?.durationSeconds)
  });
}

const keywordRadar = readJson('keyword-radar.json');
if (keywordRadar) {
  rows.push({
    label: 'The Keyword Radar',
    fileName: 'radar-beirut-keyword-radar.html',
    seconds: duration(keywordRadar.intro?.durationSeconds) + sumDurations(keywordRadar.entries) + duration(keywordRadar.synthesis?.durationSeconds)
  });
}

if (!rows.length) {
  console.log('No generated output JSON files found for duration summary.');
  process.exit(0);
}

console.log('HTML output durations:');
for (const row of rows) {
  console.log(`  ${row.fileName}`);
  console.log(`    ${row.label}: ${row.seconds.toFixed(3)}s (${formatClock(row.seconds)})`);
}
NODE
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  local folder_arg="${1:-}"
  if [[ -z "$folder_arg" ]]; then
    folder_arg="$(default_project_briefing_folder)"
    printf 'No folder argument supplied; defaulting to today'\''s project-local briefing folder:\n  %s\n' "$folder_arg"
  fi

  local folder
  folder="$(resolve_folder "$folder_arg")"
  local output_folder="$folder/output"
  local date_label
  date_label="$(infer_date_label "$folder")"

  section "Guided Radar Beirut Briefing Workflow"
  printf 'Folder: %s\n' "$folder"
  printf 'Date:   %s\n' "$date_label"

  verify_initial_assets "$folder" "$date_label"

  section "Step 2: Generate Codex Handoff Pack"
  printf 'Running:\n  npm run briefing:generate:all -- --folder %s --briefing-folder-terminal-path %s\n' "$folder" "$folder"
  npm run briefing:generate:all -- --folder "$folder" --briefing-folder-terminal-path "$folder"

  pause_for_user "Validate the generated output/codex-briefing-prompt.md before starting the blocking Codex AFK run."

  section "Step 3: Fill Folder-Local Editorial JSON Files With Codex AFK"
  cat <<EOF
Codex will read this prompt:
  $output_folder/codex-briefing-prompt.md

Codex must fill only these folder-local files:
  $folder/visual-script.json
  $folder/outlet-map.json
  $folder/quote-duel.json
  $folder/fault-line-map-script.json
  $folder/keyword-radar-script.json

Check before continuing:
  - visual-script scenes have strong headline/summary/quote layers
  - visual-script outroQuestion contains only the extracted final question
  - closing/synthesis scene analysis reads opening + penultimate summary together
  - closing/synthesis audio uses only the penultimate summary paragraph
  - outlet-map points to the right outlets and screenshots
  - quote-duel uses direct quote-vs-quote clashes
  - fault-line-map has one day-specific axis
  - keyword-radar has 3-4 loaded terms per outlet
EOF

  while true; do
    run_codex_afk "$folder"
    if verify_files_exist "$folder" \
      visual-script.json \
      outlet-map.json \
      quote-duel.json \
      fault-line-map-script.json \
      keyword-radar-script.json; then
      if node ./scripts/validate-briefing-analysis-files.mjs --folder "$folder"; then
        break
      fi
      printf '\nSome required JSON fields are still empty or invalid after Codex AFK.\n'
    else
      printf '\nSome required JSON files are still missing after Codex AFK.\n'
    fi
    pause_for_user "Review the validator output and output prompt/final-message files. Press Enter to rerun Codex AFK."
  done

  section "Step 4: Manual Closing Summary Image Generation"
  printf 'Running:\n  npm run briefing:image:prompt -- --folder %s\n' "$folder"
  npm run briefing:image:prompt -- --folder "$folder"

  local summary_prompt_path
  summary_prompt_path="$(find "$output_folder" -maxdepth 1 -type f -name '*summary-image.md' | sort | tail -n 1)"

  cat <<EOF

Manual action can run in parallel.

Open this prompt file:
  $summary_prompt_path

Run that prompt manually in Codex/ChatGPT image generation.
Save the generated image exactly as:
  $output_folder/final_summary_generated.png

The workflow will continue immediately. If the image is not present during a
build, the closing summary scene uses the dark fallback. After the image is
saved, rerun the build/review steps to include it.
EOF

  section "Step 5: Build First Draft HTML, Generate Briefing Audio, And Sync Timings"
  printf 'Running:\n  npm run briefing:build:folder -- --folder %s\n' "$folder"
  npm run briefing:build:folder -- --folder "$folder"

  move_stale_closing_audio_if_needed "$folder" "$output_folder"

  printf 'Running briefing audio generation when possible:\n  npm run audio:outlets -- --folder %s\n' "$folder"
  set +e
  npm run audio:outlets -- --folder "$folder"
  local audio_status=$?
  set -e

  if [[ "$audio_status" -ne 0 ]]; then
    printf '\nAudio generation command exited with status %s. Continuing workflow.\n' "$audio_status"
    printf 'Refreshing manifest from any existing WAV files only:\n  npm run audio:outlets -- --folder %s -- --existing-only\n' "$folder"
    set +e
    npm run audio:outlets -- --folder "$folder" --existing-only
    audio_status=$?
    set -e
  fi

  if [[ -f "$folder/audio/manifest.json" ]]; then
    printf '\nAudio manifest:\n  %s\n' "$folder/audio/manifest.json"
    node ./scripts/sync-outlet-audio-timing.mjs --folder "$folder"
    printf '\nRebuilding full outputs with audio-informed timing and briefing audio links:\n  npm run briefing:build:folder -- --folder %s\n' "$folder"
    npm run briefing:build:folder -- --folder "$folder"
  else
    printf '\nNo audio manifest was produced. Continuing without briefing audio or audio-based timing updates.\n'
  fi

  if [[ -f "$output_folder/timing-config.json" ]]; then
    cat <<EOF

Timing config is now available:
  $output_folder/timing-config.json

This file is created or reused after the first build.
Edit it now if you need manual control over intro, scene, synthesis, or outro durations.

After editing output/timing-config.json, the script will rerun:
  npm run briefing:build:folder -- --folder $folder

That rebuild applies your manual timings to the generated HTML outputs.
EOF
  else
    cat <<EOF

Expected timing config was not found:
  $output_folder/timing-config.json

The folder build normally creates this file. Check the build output above before continuing.
EOF
  fi

  pause_for_user "Review generated output data files, audio manifest, and edit output/timing-config.json if needed."

  section "Step 6: Review HTML Outputs"
  cat <<EOF
Open and review these files in your browser:
  $output_folder/radar-beirut-briefing.html
  $output_folder/radar-beirut-quote-duel.html
  $output_folder/radar-beirut-fault-line-map.html
  $output_folder/radar-beirut-keyword-radar.html

Check:
  - intro has no top ticker and matches the intro audio duration plus the 0.5s buffer
  - scenes have no scene ticker
  - date pill is centered and the outlet card starts below it
  - text does not overflow in vertical format
  - outlet screenshots appear in the right scenes
  - article screenshots are contained, not badly cropped
  - available briefing audio covers outlet scenes, the closing/synthesis scene, and the outro question
  - closing/synthesis text/analysis reflects opening + summary, while audio uses only the summary paragraph
  - no old helper notes, duplicated summary cards, or bottom-left badge returned
EOF

  pause_for_user "Make any source JSON or timing fixes, then validate the HTML review."

  section "Step 7: Final HTML Rebuild Before MP4 Render"
  printf 'Running final rebuild:\n  npm run briefing:build:folder -- --folder %s\n' "$folder"
  npm run briefing:build:folder -- --folder "$folder"

  print_output_duration_summary "$output_folder"

  sync_briefing_to_render_server "$folder" "$date_label"

  section "Step 9: Render Or Download MP4, Then Split Scene Videos"
  wait_for_windows_muted_render_mux_and_split "$folder" "$output_folder" "$date_label"

  section "Workflow Complete"
  cat <<EOF
Final outputs:
  $output_folder/radar-beirut-briefing.html
  $output_folder/radar-beirut-quote-duel.html
  $output_folder/radar-beirut-fault-line-map.html
  $output_folder/radar-beirut-keyword-radar.html
  $output_folder/radar-beirut-briefing.mp4        (muted master — keep for audio-only re-muxes)
  $output_folder/radar-beirut-briefing-final.mp4  (final video with narration)
  $output_folder/scene-videos/

Recommended final check:
  open the four HTML files, radar-beirut-briefing-final.mp4, and the split scene
  videos in Windows and confirm the latest rebuild preserved your edits and the
  narration is in sync.
EOF
}

main "$@"
