FROM alpine:3.15

# BEGIN CONFIGURATION
ENV ANDROID_HOME=/opt/android-sdk
ARG sdk_tools_version=commandlinetools-linux-7583922_latest
ARG build_tools_version=30.0.2
#  END  CONFIGURATION

SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
RUN apk add --no-cache android-tools~=31 gcompat~=1 gradle~=7 openjdk11~=11
RUN mkdir -p "$ANDROID_HOME" && \
    wget -q "https://dl.google.com/android/repository/$sdk_tools_version.zip" \
    -O sdk.zip && unzip -d "$ANDROID_HOME" sdk.zip && rm sdk.zip
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/bin

RUN (yes || true) | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
RUN sdkmanager --sdk_root="$ANDROID_HOME" "build-tools;$build_tools_version" \
    'platform-tools' "platforms;android-\
$(echo $build_tools_version | awk -F '.' '/[0-9]*/{print $1}')"

ADD config/adbkeys.tar.gz /root/.android
RUN chmod 600 /root/.android/adbkey*

EXPOSE 5037
ENTRYPOINT [ "sh" ]
