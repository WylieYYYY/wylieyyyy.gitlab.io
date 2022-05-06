FROM alpine:3.14

# BEGIN CONFIGURATION
ARG resolution=1366x768x16
#  END  CONFIGURATION

SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
RUN apk add --no-cache x11vnc~=0.9 xdpyinfo~=1 xvfb~=1
RUN printf '#!/bin/sh                                 \n\
    running_x=$(xdpyinfo > /dev/null 2>&1; echo $?)   \n\
    Xvfb $DISPLAY -screen 0 "%s" &                    \n\
    [ "$running_x" = "0" ] && { wait; exit $?; }      \n\
    while ! xdpyinfo > /dev/null 2>&1; do true; done  \n\
    [ -f "$HOME/.xinitrc" ] && sh "$HOME/.xinitrc"    \n\
    x11vnc -display $DISPLAY -repeat -nopw            \n\
' $resolution | awk '{$1=$1;print}' > /usr/local/bin/startx \
    && chmod +x /usr/local/bin/startx

COPY config/dotfiles/.desetup /root
RUN sh /root/.desetup

COPY config/dotfiles /root

ENV DISPLAY :0
EXPOSE 5900
ENTRYPOINT ["startx"]
