# Media organization helpers

# Organize top-level media files in a directory into:
#   video/      for video files
#   jpeg/       for .jpg/.jpeg files
#   raw image/  for camera RAW files
#
# Examples:
#   organize-media /path/to/dir
#   organize-media /path/to/dir --dry-run
#   organize-media . -n
def organize-media [
  target_dir: path # Directory to organize
  --dry-run (-n)   # Show what would move without changing files
] {
  let dir = ($target_dir | path expand)

  if not ($dir | path exists) {
    error make { msg: $"Directory not found: ($dir)" }
  }

  if (($dir | path type) != "dir") {
    error make { msg: $"Not a directory: ($dir)" }
  }

  let video_exts = [mp4 mov m4v avi mkv mts m2ts 3gp]
  let jpeg_exts = [jpg jpeg]
  let raw_exts = [arw cr2 cr3 nef nrw dng raf rw2 orf pef srw raw]

  let folders = [video jpeg "raw image"]

  if not $dry_run {
    for folder in $folders {
      mkdir ($dir | path join $folder)
    }
  }

  mut video_count = 0
  mut jpeg_count = 0
  mut raw_count = 0
  mut skipped_count = 0

  for file in (ls -a $dir | where type == file) {
    let name = ($file.name | path basename)

    # macOS AppleDouble metadata files like ._C0359.MP4 are moved with
    # the category of the real file they refer to.
    let classify_name = if ($name | str starts-with "._") {
      $name | str substring 2..
    } else {
      $name
    }

    let ext = (($classify_name | path parse).extension | default "" | str downcase)

    let dest_folder = if ($ext in $video_exts) {
      "video"
    } else if ($ext in $jpeg_exts) {
      "jpeg"
    } else if ($ext in $raw_exts) {
      "raw image"
    } else {
      null
    }

    if $dest_folder == null {
      continue
    }

    let dest = ($dir | path join $dest_folder $name)

    if ($dest | path exists) {
      print $"Skipping existing destination: ($dest)"
      $skipped_count = ($skipped_count + 1)
      continue
    }

    if $dry_run {
      print $"Would move: ($file.name) -> ($dest)"
    } else {
      mv $file.name $dest
    }

    if $dest_folder == "video" {
      $video_count = ($video_count + 1)
    } else if $dest_folder == "jpeg" {
      $jpeg_count = ($jpeg_count + 1)
    } else if $dest_folder == "raw image" {
      $raw_count = ($raw_count + 1)
    }
  }

  if $dry_run {
    print "Dry run complete."
  } else {
    print "Done."
  }

  print $"Moved video: ($video_count)"
  print $"Moved jpeg: ($jpeg_count)"
  print $"Moved raw image: ($raw_count)"
  print $"Skipped existing: ($skipped_count)"
}
