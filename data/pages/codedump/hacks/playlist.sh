#!/usr/bin/sh
# Under MIT license, notice at the end of the file.
# For downloading to local: ./playlist.sh download <directory>
]/../ 2>/dev/null;:                                                                                                  \
; if [ "$1" = 'download' ]; then :                                                                                   \
;   [ -n "$2" ] && dir="$2" || dir="Music/"                                                                          \
;   mkdir --parent "$dir"                                                                                            \
;   existing="$(ls -- "$dir" | sed 's/.*\.\([^.]*\)\.[^.]*/youtube \1/g')"                                           \
;   args="--format ba --download-archive /dev/stdin"                                                                 \
;   printf '%s\n' "$existing" | yt-dlp $args --output '%(title)s.%(id)s.%(ext)s' --paths "$dir" --batch-file "$0"    \
;   exit                                                                                                             \
; fi                                                                                                                 \
; line_count="$(wc --lines < "$0")"; selected_link=                                                                  \
; while [ -z "$selected_link" ]                                                                                      \
;   do line_number="$(shuf --input-range=1-"$line_count" --head-count=1)"                                            \
;   selected_line="$(sed --quiet "$line_number"p < "$0")"                                                            \
;   selected_link="$(printf '%s' "$selected_line" | awk --field-separator='#|;|]' '{gsub(/ +/, "", $1); print $1}')" \
; done                                                                                                               \
; printf '%s\n' "$selected_line" | awk --field-separator='#' '{sub(/^ /, "", $NF); print $NF}'                       \
; if ! selected_link="$(yt-dlp --get-url --format ba -- "$selected_link" 2> /dev/null)"                              \
;   then echo 'broken link, skipping...'                                                                             \
;   else cvlc --play-and-exit --network-caching 5000 -- "$selected_link" 2> /dev/null                                \
; fi; exit; :<<'] IGNORE_UNTIL_EOF ['

# Why?
# This script is quite useful for shuffle playing when online,
# and download audios in a batch when going offline.
#
# How to use it?
# Set the executable bit, and this can be run to shuffle play.
# The command on the second line is for downloading all entries,
# caching depends on the ID portion of the file name.
# This file follows the syntax of a yt-dlp playlist, where ';', ']', '#'
# signifies start of a comment, white spaces and empty lines are ignored,
# and a video ID can be placed at the start for selection.
# Title can be placed at the end after '#' for displaying while playing.
#
# Entries below have been provided as an exmaple.

; Miscellaneous
gGN01Ieu0fQ # Smash Mouth # All Star
vbN3CMOfNAg # John Denver # Country Roads

] Taylor Swift [
    oQ0sRlUABLg # Blank Space
    NbyT8HnBheU # Love Story

] IGNORE_UNTIL_EOF [

# Technical detail
#
# This file starts with ']/../', which satisfies two conditions: a) it is a
# valid comment, and b) it does absolutely nothing in a normal shell. ';'
# cannot be used as shells do not allow scripts to start with ';', and '#' is
# not allowed for obvious reasons. Some shells navigates back to the current
# directory if there is not an interactive mode switch, and some shells reports
# that it is a directory.
#
# After that, a simpler syntax can be used: '\' and ';' as it can pretend to
# extend the last line. The script reroll until a valid line is obtained, print
# the name, and play it with a combination of yt-dlp and VLC.
#
# In the last line, there is ':<<'] IGNORE_UNTIL_EOF ['' after exiting. This is
# to simulate a here-document that does nothing, in order to calm some syntax
# highlighters down, panicking about ']', '[', and '''. And the ending
# '] IGNORE_UNTIL_EOF [' is to calm some shell complaining about missing end of
# the here-document.

# MIT License
#
# Copyright (c) 2024 Yuen Tsang Yin
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
