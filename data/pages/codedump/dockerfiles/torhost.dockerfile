FROM alpine:3.15

# BEGIN CONFIGURATION
ARG hidden_service_dir=/var/lib/tor/hidden_service
ARG service_port=80
#  END  CONFIGURATION

SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
RUN apk add --no-cache sudo~=1 tor~=0.4 libqrencode~=4
WORKDIR /etc/tor
RUN mv torrc.sample torrc && printf '\
    RunAsDaemon 1         \n\
    HiddenServiceDir %s   \n\
    HiddenServicePort %s  \n\
' "$hidden_service_dir" "$service_port" | awk '{$1=$1;print}' >> torrc

WORKDIR "$hidden_service_dir"
ADD config/hidden_service.tar.gz .
RUN chown -R tor:nogroup . && chmod 700 . && chmod 600 ./*

RUN printf '#!/bin/sh                    \n\
    sudo -u tor tor                      \n\
    qrencode -t ANSIUTF8 -r %s/hostname  \n\
    sh                                   \n\
' "$hidden_service_dir" | awk '{$1=$1;print}' > /usr/local/bin/start_tor \
    && chmod +x /usr/local/bin/start_tor

WORKDIR /
ENTRYPOINT ["start_tor"]
