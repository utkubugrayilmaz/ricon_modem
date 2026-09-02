&#x20;   Directory: C:\\





Mode                 LastWriteTime         Length Name

\----                 -------------         ------ ----

d-----         6.08.2026     09:10                flutter

d-----        15.09.2025     22:46                inetpub

d-----         1.04.2024     10:26                PerfLogs

d-r---         6.08.2026     08:52                Program Files

d-r---         4.08.2026     04:39                Program Files (x86)

d-----        26.08.2026     08:44                Projeler

d-----        18.08.2026     15:12                test

d-r---        28.07.2026     08:12                Users

d-----        23.08.2026     22:21                Windows





PS C:\\> cd Projeler

PS C:\\Projeler> cd .\\ricon\_modem\\

PS C:\\Projeler\\ricon\_modem> node --env-file=.env ricon.js dogrula

{

&#x20; "zaman": "2026-08-26T07:55:29.148Z",

&#x20; "komut": "dogrula",

&#x20; "modem\_ip": "192.168.1.1",

&#x20; "problems": \[],

&#x20; "yerel\_arayuzler": \[

&#x20;   {

&#x20;     "arayuz": "Ethernet",

&#x20;     "ip": "192.168.1.50",

&#x20;     "mask": "255.255.255.0"

&#x20;   },

&#x20;   {

&#x20;     "arayuz": "Ethernet",

&#x20;     "ip": "192.168.53.84",

&#x20;     "mask": "255.255.255.0"

&#x20;   },

&#x20;   {

&#x20;     "arayuz": "Wi-Fi",

&#x20;     "ip": "10.60.1.41",

&#x20;     "mask": "255.255.255.0"

&#x20;   }

&#x20; ],

&#x20; "kaynak\_ip": "192.168.1.50",

&#x20; "erisilebilir": true,

&#x20; "sistem\_ucu": {

&#x20;   "kod": 200,

&#x20;   "boyut": 597

&#x20; },

&#x20; "kimlikli\_uc": {

&#x20;   "kod": 200

&#x20; },

&#x20; "kimlik\_hazir": true,

&#x20; "ok": true

}



Ricon modem — 192.168.1.1  (2026-08-26T07:55:29.148Z)

PS C:\\Projeler\\ricon\_modem> node --env-file=.env ricon.js oku --json data/deneme.json

\[oku] /asp/status/Info.htm

\[oku] /asp/status/Info.live.htm

\[oku] /asp/status/Status\_Internet.live.asp

\[oku] /asp/status/Status\_Wireless.live.asp

\[oku] /asp/setup/index.asp

\[oku] /nvrambak.bin

{

&#x20; "zaman": "2026-08-26T07:55:51.329Z",

&#x20; "komut": "oku",

&#x20; "modem\_ip": "192.168.1.1",

&#x20; "kimlik\_hazir": true,

&#x20; "uclar": {

&#x20;   "info": {

&#x20;     "yol": "/asp/status/Info.htm",

&#x20;     "kod": 200,

&#x20;     "boyut": 17715,

&#x20;     "tur": "sistem",

&#x20;     "ham\_html\_boyut": 17715

&#x20;   },

&#x20;   "info\_live": {

&#x20;     "yol": "/asp/status/Info.live.htm",

&#x20;     "kod": 200,

&#x20;     "boyut": 598,

&#x20;     "tur": "sistem"

&#x20;   },

&#x20;   "internet\_live": {

&#x20;     "yol": "/asp/status/Status\_Internet.live.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 3276,

&#x20;     "tur": "kimlik"

&#x20;   },

&#x20;   "wireless\_live": {

&#x20;     "yol": "/asp/status/Status\_Wireless.live.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 244,

&#x20;     "tur": "kimlik"

&#x20;   },

&#x20;   "setup\_index": {

&#x20;     "yol": "/asp/setup/index.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 25672,

&#x20;     "tur": "kimlik",

&#x20;     "ham\_html\_boyut": 25672

&#x20;   },

&#x20;   "nvram\_yedek": {

&#x20;     "yol": "/nvrambak.bin",

&#x20;     "kod": 200,

&#x20;     "boyut": 28724,

&#x20;     "tur": "config"

&#x20;   }

&#x20; },

&#x20; "ham\_alanlar": {

&#x20;   "uptime": "Wed, 26 Aug 2026 10:55:52",

&#x20;   "uptime\_spe": "10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09",

&#x20;   "lan\_mac": "00:0C:43:43:5F:4E",

&#x20;   "wan\_mac1": "02:0C:29:A3:9B:6D",

&#x20;   "wan\_mac2": "",

&#x20;   "wl\_mac": "",

&#x20;   "lan\_ip": "192.168.1.1",

&#x20;   "wl\_channel": "Unknown",

&#x20;   "wl\_radio": "Radio is Off",

&#x20;   "wl\_mode\_short": "ap",

&#x20;   "lan\_proto": "dhcp",

&#x20;   "active\_wireless": "",

&#x20;   "active\_wds": "",

&#x20;   "mem\_info": ",'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000",

&#x20;   "cpu\_temp": "",

&#x20;   "ip\_conntrack": "10",

&#x20;   "pptpcl\_leases": "",

&#x20;   "l2tpcl\_leases": "",

&#x20;   "wan\_ttraffs": "",

&#x20;   "w1ipinfo": "31.140.144.25",

&#x20;   "w2ipinfo": "",

&#x20;   "wan\_uptime": "0:49:51",

&#x20;   "w1\_wan\_shortproto": "m13gdhcp",

&#x20;   "w2\_wan\_shortproto": "dhcp",

&#x20;   "m13gname": "Q200AF",

&#x20;   "m1imei": "867191084820421",

&#x20;   "m1sim": "SIM1",

&#x20;   "m1simst": "OK",

&#x20;   "m1simimsi": "286016661026495",

&#x20;   "m1simiccid": "8990011626160064930F",

&#x20;   "m1signal": "",

&#x20;   "m1dbm": "65",

&#x20;   "m1network": "FDD LTE",

&#x20;   "m1bandinfo": "LTE-FDD B7",

&#x20;   "m1cellid": "70D02C",

&#x20;   "m1noiseratio": "19",

&#x20;   "m23gname": "",

&#x20;   "m2imei": "",

&#x20;   "m2sim": "SIM2",

&#x20;   "m2simst": "Invalid",

&#x20;   "m2simimsi": "",

&#x20;   "m2simiccid": "",

&#x20;   "m2signal": "",

&#x20;   "m2dbm": "",

&#x20;   "m2network": "",

&#x20;   "m2bandinfo": "",

&#x20;   "m2cellid": "",

&#x20;   "m2noiseratio": "",

&#x20;   "w1\_wanup": "0:50:00",

&#x20;   "w1\_wan\_ip": "31.140.144.25",

&#x20;   "w1\_wan\_nm": "255.0.0.0",

&#x20;   "w1\_wan\_gw": "31.140.144.230",

&#x20;   "w1\_wan\_dns": "213.74.0.4 213.74.1.4",

&#x20;   "w1\_dhcp\_remaining": "0 days 23:09:59",

&#x20;   "w2\_wanup": "Not available",

&#x20;   "w2\_wan\_ip": "",

&#x20;   "w2\_wan\_nm": "",

&#x20;   "w2\_wan\_gw": "",

&#x20;   "w2\_wan\_dns": "",

&#x20;   "w2\_dhcp\_remaining": "0 days 00:00:00",

&#x20;   "wl\_ssid": "Ricon-WiFi",

&#x20;   "wl\_xmit": "",

&#x20;   "wl\_rate": "Disabled",

&#x20;   "wl\_ack": "",

&#x20;   "packet\_info": "SWRXgoodPacket=0;SWRXerrorPacket=0;SWTXgoodPacket=0;SWTXerrorPacket=0;"

&#x20; },

&#x20; "problems": \[],

&#x20; "nvram": {

&#x20;   "wl\_mac\_deny": "",

&#x20;   "wl\_txstreams": "0",

&#x20;   "wl\_maxassoc": "128",

&#x20;   "wl\_phytypes": "",

&#x20;   "wl\_distance": "2000",

&#x20;   "wl\_infra": "1",

&#x20;   "wl\_wme\_apsd": "on",

&#x20;   "wl\_mrate": "0",

&#x20;   "wl\_active\_add\_mac": "0",

&#x20;   "wl\_wme\_sta\_vi": "7 15 2 6016 3008 off",

&#x20;   "wl\_wme\_ap\_be": "15 63 3 0 0 off",

&#x20;   "wl\_wme\_sta\_vo": "3 7 2 3264 1504 off",

&#x20;   "wl\_plcphdr": "long",

&#x20;   "wl\_macmode": "disabled",

&#x20;   "wl\_wme\_ap\_bk": "15 1023 7 0 0 off",

&#x20;   "wl\_phytype": "g",

&#x20;   "wl\_lazywds": "0",

&#x20;   "wl\_dfs\_postism": "60",

&#x20;   "wl\_mode": "ap",

&#x20;   "wl\_wme\_txp\_vi": "7 3 4 2 0",

&#x20;   "wl\_wme\_txp\_vo": "7 3 4 2 0",

&#x20;   "wl\_dtim": "1",

&#x20;   "wl\_ssid": "Ricon-WiFi",

&#x20;   "wl\_shortslot": "auto",

&#x20;   "wl\_passphrase": "",

&#x20;   "wl\_hwaddr": "",

&#x20;   "wl\_active\_mac": "",

&#x20;   "wl\_net\_mode": "mixed",

&#x20;   "wl\_rxstreams": "0",

&#x20;   "wl\_rate": "0",

&#x20;   "wl\_macmode1": "disabled",

&#x20;   "wl\_rateset": "default",

&#x20;   "wl\_crypto": "off",

&#x20;   "wl\_wep\_bit": "64",

&#x20;   "wl\_unit": "0",

&#x20;   "wl\_nmode\_protection": "auto",

&#x20;   "wl\_wds": "",

&#x20;   "wl\_wme": "on",

&#x20;   "wl\_radauth": "0",

&#x20;   "wl\_wme\_ap\_vi": "7 15 1 6016 3008 off",

&#x20;   "wl\_auth": "0",

&#x20;   "wl\_wep\_last": "",

&#x20;   "wl\_wme\_ap\_vo": "3 7 1 3264 1504 off",

&#x20;   "wl\_frameburst": "off",

&#x20;   "wl\_ifname": "",

&#x20;   "wl\_wep": "disabled",

&#x20;   "wl\_gmode\_protection": "auto",

&#x20;   "wl\_frag": "2346",

&#x20;   "wl\_wep\_gen": "",

&#x20;   "wl\_wme\_sta\_be": "15 1023 3 0 0 off",

&#x20;   "wl\_radioids": "",

&#x20;   "wl\_corerev": "",

&#x20;   "wl\_wme\_sta\_bk": "15 1023 7 0 0 off",

&#x20;   "wl\_afterburner": "off",

&#x20;   "wl\_radio": "1",

&#x20;   "wl\_rts": "2347",

&#x20;   "wl\_ap\_isolate": "0",

&#x20;   "wl\_mac\_list": "",

&#x20;   "wl\_wme\_no\_ack": "off",

&#x20;   "wl\_wme\_txp\_be": "7 3 4 2 0",

&#x20;   "wl\_dfs\_preism": "60",

&#x20;   "wl\_wme\_txp\_bk": "7 3 4 2 0",

&#x20;   "wl\_bcn": "100",

&#x20;   "wl\_wep\_buf": "",

&#x20;   "wl\_reg\_mode": "off",

&#x20;   "pro\_showpkt\_en": "0",

&#x20;   "wl0\_wds2\_if": "",

&#x20;   "wl0.1\_radius\_port": "1812",

&#x20;   "filter\_dport\_grp3": "",

&#x20;   "ses\_script": "",

&#x20;   "mqtt\_dn": "",

&#x20;   "http\_redirect\_port": "3128",

&#x20;   "wl0\_wds10\_ospf": "",

&#x20;   "l2tp\_client\_rebootivl": "30",

&#x20;   "filter\_dport\_grp4": "",

&#x20;   "ntrip\_lat": "",

&#x20;   "reboot\_tm\_h": "3",

&#x20;   "filter": "off",

&#x20;   "filter\_dport\_grp5": "",

&#x20;   "NC\_Verbosity": "2",

&#x20;   "wds0.1": "",

&#x20;   "l2tp\_passwd": "",

&#x20;   "wl0\_net\_mode": "disabled",

&#x20;   "filter\_dport\_grp6": "",

&#x20;   "ospf\_intadvanced": "0",

&#x20;   "sv\_localdns": "0.0.0.0",

&#x20;   "netauth\_preauthtm": "2",

&#x20;   "openvpn\_lzo": "0",

&#x20;   "openvpncl\_ip": "",

&#x20;   "enc\_shpkt": "0",

&#x20;   "dtu\_servmode": "5",

&#x20;   "wds0.2": "",

&#x20;   "filter\_dport\_grp7": "",

&#x20;   "AD7028-DS": "S9922S",

&#x20;   "openvpncl\_client": "",

&#x20;   "dtu\_lkaddr\_101": "1",

&#x20;   "dtu\_stopbit": "1",

&#x20;   "wds0.3": "",

&#x20;   "l2tp\_client\_keepfail": "5",

&#x20;   "l2tpclt\_mppe40b": "1",

&#x20;   "wl0\_frameburst": "off",

&#x20;   "filter\_dport\_grp8": "",

&#x20;   "mqtt\_ds": "",

&#x20;   "python\_enable": "0",

&#x20;   "pptpclt\_chapms\_v2": "1",

&#x20;   "wds\_watchdog\_interval\_sec": "1000",

&#x20;   "wds0.4": "",

&#x20;   "filter\_dport\_grp9": "",

&#x20;   "w2\_recon": "0",

&#x20;   "loopback\_netmask": "255.0.0.0",

&#x20;   "AR7888": "AR7088H",

&#x20;   "enc\_up\_flowctrl": "1",

&#x20;   "zebra\_log": "0",

&#x20;   "wds0.5": "",

&#x20;   "reboot\_tm\_m": "00",

&#x20;   "ddns\_username\_2": "",

&#x20;   "ipsec\_compatmode": "1",

&#x20;   "log\_ipaddr": "0",

&#x20;   "AR7800": "AR7000",

&#x20;   "NC\_RenewTimeout": "0",

&#x20;   "wds0.6": "",

&#x20;   "wl0\_wds7\_ospf": "",

&#x20;   "wl0\_wds3\_desc": "",

&#x20;   "ddns\_username\_3": "",

&#x20;   "ntp\_interval": "3600",

&#x20;   "exempt\_ceil\_dn": "100",

&#x20;   "wds0.7": "",

&#x20;   "ddns\_username\_4": "",

&#x20;   "ppp\_idletime": "5",

&#x20;   "openvpncl\_enable": "0",

&#x20;   "NC\_SplashURL": "",

&#x20;   "zebra\_copt": "0",

&#x20;   "wds0.8": "",

&#x20;   "ddns\_username\_5": "",

&#x20;   "w2\_lnkp": "1",

&#x20;   "netauth\_username": "admin",

&#x20;   "eth2\_netmask": "0.0.0.0",

&#x20;   "port2vlan": "1",

&#x20;   "wds0.9": "",

&#x20;   "syslog\_pri\_ur": "6",

&#x20;   "ddns\_username\_6": "",

&#x20;   "w1\_kponcount": "5",

&#x20;   "quagga\_debug\_enable": "0",

&#x20;   "openvpn\_dupcn": "0",

&#x20;   "enc\_iecpublen\_101": "2",

&#x20;   "standard\_ceil\_up": "10",

&#x20;   "ddns\_username\_7": "",

&#x20;   "et0macaddr": "00:0C:43:43:5F:4E",

&#x20;   "python\_memory": "16",

&#x20;   "dtu\_cli\_redialtotaltm": "0",

&#x20;   "snmpd\_rocommunity": "public",

&#x20;   "ddns\_username\_8": "",

&#x20;   "ddns\_enable": "0",

&#x20;   "wl0.3\_key": "1",

&#x20;   "wl0\_leddc": "0x640000",

&#x20;   "mqtt\_serip": "",

&#x20;   "AR7088-DSTD": "S9922L",

&#x20;   "openvpn\_mtu": "1500",

&#x20;   "NC\_MaxMissedARP": "5",

&#x20;   "wl0\_ipaddr": "0.0.0.0",

&#x20;   "NC\_MACWhiteList": "",

&#x20;   "enc\_iecpublen\_104": "2",

&#x20;   "l2tp\_rip": "",

&#x20;   "skip\_intel\_check": "0",

&#x20;   "ddns\_conf": "",

&#x20;   "wl0.2\_radius\_port": "1812",

&#x20;   "wl0\_shortslot": "auto",

&#x20;   "ipsec\_debug": "0",

&#x20;   "wl0\_akm": "psk psk2",

&#x20;   "mqtt\_pub": "",

&#x20;   "openvpncl\_key": "",

&#x20;   "dtu\_proto\_filter": "0",

&#x20;   "syslogd\_rem\_ip": "",

&#x20;   "ppp\_restartppp": "1",

&#x20;   "boot\_wait": "on",

&#x20;   "nas\_enable": "1",

&#x20;   "filter\_web\_host1": "",

&#x20;   "bgp\_autosummary": "0",

&#x20;   "ntrip\_ggamodel": "2",

&#x20;   "mqtt\_ser\_auth": "0",

&#x20;   "m1s2ppppwd": "card",

&#x20;   "wl0.2\_netmask": "0.0.0.0",

&#x20;   "filter\_web\_host2": "",

&#x20;   "gps\_keygsa": "1",

&#x20;   "ipsec\_remode": "0",

&#x20;   "eth6\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_tun\_netmask": "",

&#x20;   "premium\_ceil\_dn": "75",

&#x20;   "filter\_web\_host3": "",

&#x20;   "m2s1band": "0",

&#x20;   "fw\_disable": "0",

&#x20;   "pptpd\_client\_srvsub": "",

&#x20;   "openvpn\_dh": "",

&#x20;   "wl0\_wds1\_if": "",

&#x20;   "wl0\_wds5\_ospf": "",

&#x20;   "wl0\_wds1\_desc": "",

&#x20;   "router\_name": "Industrial Cellular Router",

&#x20;   "filter\_web\_host4": "",

&#x20;   "m1\_ims": "0",

&#x20;   "wshaper\_enable": "0",

&#x20;   "l2tpclt\_chap": "1",

&#x20;   "filter\_web\_host5": "",

&#x20;   "eth0\_ipaddr": "0.0.0.0",

&#x20;   "pptpclt\_mppe40b": "1",

&#x20;   "dtu\_short\_link\_mode": "0",

&#x20;   "dtu\_clientmode": "",

&#x20;   "dtu\_flowctrl": "1",

&#x20;   "wl0\_wds6\_enable": "0",

&#x20;   "ddns\_wildcard": "",

&#x20;   "def\_lhwaddr": "00:00:00:00:00:00",

&#x20;   "https\_enable": "0",

&#x20;   "filter\_web\_host6": "",

&#x20;   "pam\_unlocktm": "0",

&#x20;   "exempt\_ceil\_up": "100",

&#x20;   "apwatchdog\_enable": "0",

&#x20;   "wl0.2\_wpa\_psk": "",

&#x20;   "m2\_chapms\_v2\_allowed": "1",

&#x20;   "filter\_web\_host7": "",

&#x20;   "m2m\_net\_proto": "1",

&#x20;   "af\_publish": "1",

&#x20;   "openvpncl\_config": "",

&#x20;   "openvpncl\_authmode": "0",

&#x20;   "svqos\_port2bw": "FULL",

&#x20;   "wl0\_wds3\_netmask": "",

&#x20;   "telnet\_wanport": "5123",

&#x20;   "l2tp\_get\_ip": "",

&#x20;   "l2tp\_client\_srvmtu": "1450",

&#x20;   "filter\_web\_host8": "",

&#x20;   "ses\_event": "2",

&#x20;   "m2simfail": "90",

&#x20;   "ospf\_vtyarea": "2",

&#x20;   "AR7000-DP": "S1000-MEB",

&#x20;   "dhcpfwd\_ip": "0.0.0.0",

&#x20;   "encup\_link": "server.alotcer.com,28035;,;,;,;,;",

&#x20;   "filter\_web\_host9": "",

&#x20;   "radio1\_on\_time": "111111111111111111111111",

&#x20;   "wshaper\_uplink\_": "0",

&#x20;   "pptpd\_forcemppe": "1",

&#x20;   "pptp\_server\_ip": "",

&#x20;   "ppp\_get\_ac": "",

&#x20;   "ali\_iot\_port0": "23",

&#x20;   "mqtt\_service\_id": "",

&#x20;   "eth6\_ipaddr": "0.0.0.0",

&#x20;   "pptpd\_lcp\_failure": "3",

&#x20;   "port0vlan": "0",

&#x20;   "pptpd\_bcrelay": "0",

&#x20;   "restore\_defaults": "0",

&#x20;   "ali\_iot\_port1": "80",

&#x20;   "lan\_ipaddr\_ex1": "192.168.8.1",

&#x20;   "AR7000-DS": "S9922XL",

&#x20;   "pptp\_use\_dhcp": "0",

&#x20;   "pro\_repeat\_en": "0",

&#x20;   "wl0\_wds5\_hwaddr": "",

&#x20;   "remote\_ip1": "0.0.0.0 0",

&#x20;   "lan\_ipaddr\_ex2": "0.0.0.0",

&#x20;   "wl0.3\_radius\_key": "",

&#x20;   "wl0.3\_radius\_port": "1812",

&#x20;   "wl0.1\_key": "1",

&#x20;   "remote\_ip2": "0.0.0.0 0",

&#x20;   "lan\_ipaddr\_ex3": "0.0.0.0",

&#x20;   "pptpd\_client\_srvip": "",

&#x20;   "wl0\_wds10\_hwaddr": "",

&#x20;   "l2tpclt\_auth": "1",

&#x20;   "remote\_ip3": "0.0.0.0 0",

&#x20;   "ospf\_priority": "1",

&#x20;   "af\_dnathost": "0",

&#x20;   "m1s1conmode": "0",

&#x20;   "wl0\_wme\_sta\_be": "15 1023 3 0 0 off",

&#x20;   "wl0\_nctrlsb": "lower",

&#x20;   "remote\_ip4": "0.0.0.0 0",

&#x20;   "filter\_port": "",

&#x20;   "remote\_ip5": "0.0.0.0 0",

&#x20;   "eth10\_bridged": "1",

&#x20;   "wl0.3\_auth\_mode": "disabled",

&#x20;   "gps\_comdatabit": "1",

&#x20;   "mqtt\_ser\_psk": "",

&#x20;   "remote\_ip6": "0.0.0.0 0",

&#x20;   "pptpclt\_chapms": "1",

&#x20;   "ip\_conntrack\_tcp\_timeouts": "3600",

&#x20;   "wl0\_wds3\_ospf": "",

&#x20;   "wl0\_wds7\_netmask": "",

&#x20;   "ddns\_hostname": "",

&#x20;   "wl0.2\_ssid": "",

&#x20;   "http\_wanport": "8088",

&#x20;   "filter\_ip\_grp1": "",

&#x20;   "ospf\_linktrdelay": "1",

&#x20;   "remote\_ip7": "0.0.0.0 0",

&#x20;   "openvpn\_redirgate": "0",

&#x20;   "encdw\_sernum": "0",

&#x20;   "premium\_ceil\_up": "75",

&#x20;   "filter\_ip\_grp2": "",

&#x20;   "m2s1conmode": "0",

&#x20;   "gps\_keyoth": "1",

&#x20;   "lan\_gateway": "0.0.0.0",

&#x20;   "remote\_ip8": "0.0.0.0 0",

&#x20;   "AD7028-ES": "S9922S",

&#x20;   "w2\_kpon\_lan\_switch": "2",

&#x20;   "dtu\_srv\_tmot1": "2700",

&#x20;   "dtu\_cli\_bindlan": "1",

&#x20;   "l2tp\_client\_enable": "0",

&#x20;   "filter\_ip\_grp3": "",

&#x20;   "wl0\_ifname": "ra0",

&#x20;   "remote\_ip9": "0.0.0.0 0",

&#x20;   "snmp\_trap\_manager\_ip": "192.168.1.254",

&#x20;   "openvpncl\_tun\_serip": "10.8.0.1",

&#x20;   "shutdown\_day\_e": "0",

&#x20;   "dr\_lan\_rx": "0",

&#x20;   "filter\_ip\_grp4": "",

&#x20;   "ntrip\_long": "",

&#x20;   "lan\_domain": "",

&#x20;   "af\_city": "",

&#x20;   "openvpn\_debug": "0",

&#x20;   "wl0\_wme\_sta\_bk": "15 1023 7 0 0 off",

&#x20;   "dtu\_publen\_101": "2",

&#x20;   "snmpd\_rwcommunity": "private",

&#x20;   "wl0\_wds4\_ipaddr": "",

&#x20;   "filter\_ip\_grp5": "",

&#x20;   "ospf\_vtyadvanced": "0",

&#x20;   "hs\_html": "",

&#x20;   "filter\_ip\_grp6": "",

&#x20;   "log\_accepted": "0",

&#x20;   "pptpd\_client\_ipparam": "",

&#x20;   "pptpd\_client\_srvsec": "",

&#x20;   "dtu\_downlink\_mode": "0",

&#x20;   "dtu\_cli\_redialivl": "10",

&#x20;   "pppoe\_ac": "",

&#x20;   "filter\_ip\_grp7": "",

&#x20;   "filter\_rule1": "",

&#x20;   "vrrp\_virip1": "0.0.0.0",

&#x20;   "gps\_keygsv": "1",

&#x20;   "smsctrl\_rule": "sms1,1,ANY,0,connect;sms2,1,ANY,1,disconnect;sms3,1,ANY,2,reboot;sms4,1,ANY,3,;",

&#x20;   "pptpd\_lcp\_interval": "15",

&#x20;   "dtu\_publen\_104": "2",

&#x20;   "cloud\_syslogenable": "0",

&#x20;   "hb\_server\_ip": "",

&#x20;   "ipsec\_pass": "1",

&#x20;   "filter\_ip\_grp8": "",

&#x20;   "filter\_rule2": "",

&#x20;   "ses\_button": "0",

&#x20;   "ospf\_nssatrans": "0",

&#x20;   "vrrp\_virip2": "0.0.0.0",

&#x20;   "openvpncl\_remoteip": "0.0.0.0",

&#x20;   "wl0\_wds0\_if": "",

&#x20;   "pptpd\_radserver": "0.0.0.0",

&#x20;   "rflow\_enable": "0",

&#x20;   "filter\_ip\_grp9": "",

&#x20;   "filter\_rule3": "",

&#x20;   "ses\_enable": "1",

&#x20;   "vrrp\_virip3": "0.0.0.0",

&#x20;   "expert\_mode": "1",

&#x20;   "schedule\_minutes": "0",

&#x20;   "wl0.2\_key1": "",

&#x20;   "filter\_rule4": "",

&#x20;   "openvpncl\_cipher": "bf-cbc",

&#x20;   "wl0.2\_key2": "",

&#x20;   "filter\_rule5": "",

&#x20;   "w1\_kpontimeout": "3",

&#x20;   "ospf\_vtyhello": "10",

&#x20;   "AD7028-A": "S9922S",

&#x20;   "openvpncl\_tlscip": "0",

&#x20;   "wl0\_mrate": "0",

&#x20;   "wl0.2\_key3": "",

&#x20;   "filter\_ip\_grp10": "",

&#x20;   "filter\_rule6": "",

&#x20;   "dtu\_servport1": "6002",

&#x20;   "wol\_passwd": "",

&#x20;   "wl0.2\_key4": "",

&#x20;   "wl0\_mode": "ap",

&#x20;   "filter\_rule7": "",

&#x20;   "dtu\_parity": "1",

&#x20;   "wl0\_wds1\_ospf": "",

&#x20;   "pptpd\_radpass": "",

&#x20;   "dhcp\_start": "100",

&#x20;   "filter\_rule8": "",

&#x20;   "ali\_iot\_enable": "0",

&#x20;   "AD7028-D": "S9922S",

&#x20;   "filter\_rule9": "",

&#x20;   "AD7028-E": "S9922S",

&#x20;   "pptpd\_enable": "0",

&#x20;   "wl0\_ap\_isolate": "0",

&#x20;   "vrrp\_times": "10",

&#x20;   "AD7028-F": "S9922S",

&#x20;   "openvpn\_client": "",

&#x20;   "svqos\_port4prio": "10",

&#x20;   "filter\_services\_1": "",

&#x20;   "dist\_type": "",

&#x20;   "snmp\_trap\_interval": "300",

&#x20;   "NC\_DocumentRoot": "/www",

&#x20;   "boot\_day": "0",

&#x20;   "wshaper\_nopriohostsrc": "",

&#x20;   "l2tp\_server\_ip": "",

&#x20;   "l2tp\_server\_enable": "0",

&#x20;   "ddns\_force": "10",

&#x20;   "m1\_chapms\_allowed": "1",

&#x20;   "wl0\_wme\_no\_ack": "off",

&#x20;   "enc\_timenable": "0",

&#x20;   "wl0\_gmode": "1",

&#x20;   "dhcp\_lease": "1440",

&#x20;   "af\_zip": "",

&#x20;   "openvpncl\_debug": "0",

&#x20;   "encdw\_checkdiscon": "1",

&#x20;   "m2s1wanapn": "3gnet",

&#x20;   "mqtt\_comparity": "1",

&#x20;   "eth3\_bridged": "1",

&#x20;   "openvpn\_keep\_invl": "10",

&#x20;   "openvpn\_proto": "udp",

&#x20;   "wds\_watchdog\_ips": "",

&#x20;   "remote\_ip\_any": "1",

&#x20;   "ntrip\_mountpoint": "",

&#x20;   "AR7000-FSP": "S1000-MEB",

&#x20;   "pptpd\_client\_assign": "0",

&#x20;   "openvpn\_enable": "0",

&#x20;   "ddns\_period": "60",

&#x20;   "limit\_ssh": "0",

&#x20;   "wl0.2\_wpa\_gtk\_rekey": "3600",

&#x20;   "mqtt\_ser\_port": "1883",

&#x20;   "pptpd\_client\_assignip": "0.0.0.0",

&#x20;   "urlfilter\_enable": "0",

&#x20;   "dnsmasq\_enable": "1",

&#x20;   "w1\_lnkpnivl": "5",

&#x20;   "ping\_ip": "",

&#x20;   "AR7000-EP": "S1000-MEB",

&#x20;   "eth10\_netmask": "0.0.0.0",

&#x20;   "dtu\_cli\_redialwait": "60",

&#x20;   "dtu\_ser1en": "0",

&#x20;   "wl0\_nband": "2",

&#x20;   "m1\_wan\_netmask": "",

&#x20;   "ntrip\_netip": "",

&#x20;   "mqtt\_ser\_clientid": "",

&#x20;   "wan\_nat": "1",

&#x20;   "af\_agree": "0",

&#x20;   "encup\_mode": "1",

&#x20;   "w2\_wan\_proto": "dhcp",

&#x20;   "stats\_server": "",

&#x20;   "static\_route": "",

&#x20;   "w2\_lnkpnivl": "5",

&#x20;   "w2\_kpontimeout": "3",

&#x20;   "AR7000-ES": "S9922XL",

&#x20;   "openvpncl\_ca": "",

&#x20;   "sip\_port": "5060",

&#x20;   "NC\_extifname": "auto",

&#x20;   "cloud\_servport": "7001",

&#x20;   "telnet\_lanport": "5123",

&#x20;   "wl0\_nreqd": "0",

&#x20;   "ospf\_linkauthmd5key": "2",

&#x20;   "pptpd\_client\_mtu": "1450",

&#x20;   "openvpncl\_tlsauth": "",

&#x20;   "radvd\_conf": "",

&#x20;   "wl0\_security\_mode": "psk psk2",

&#x20;   "wl0.1\_crypto": "off",

&#x20;   "wl0.3\_bridged": "1",

&#x20;   "pam\_tacplus\_en": "0",

&#x20;   "ntrip\_recon": "15",

&#x20;   "lan\_netmask": "255.255.255.0",

&#x20;   "eth7\_bridged": "1",

&#x20;   "wl0\_wme\_txp\_be": "7 3 4 2 0",

&#x20;   "wl0\_wds1\_enable": "0",

&#x20;   "dmz\_enable": "0",

&#x20;   "http\_source\_network": "0.0.0.0",

&#x20;   "wifi\_display": "wl0",

&#x20;   "wl0\_dtim": "1",

&#x20;   "wl0\_ssid": "Ricon-WiFi",

&#x20;   "http\_username": "$1$JWLkvRy2$0ZqGZNx7nR/pyhBq6DhMa1",

&#x20;   "ali\_iot\_serip": "backend-iotx-remote-debug.aliyun.com",

&#x20;   "ospf\_spfhold": "5000",

&#x20;   "enc\_up\_databit": "1",

&#x20;   "port\_trigger": "",

&#x20;   "ospf\_areatype": "0",

&#x20;   "openvpn\_debug\_level": "4",

&#x20;   "filter\_web\_host10": "",

&#x20;   "w1\_dns": "0.0.0.0",

&#x20;   "ospf\_vtyip": "1.1.1.1",

&#x20;   "mqtt\_authmode": "0",

&#x20;   "http\_redirect\_enable": "0",

&#x20;   "openvpn\_adv": "0",

&#x20;   "shutdown\_hours": "0",

&#x20;   "l2tp\_client\_assignip": "0.0.0.0",

&#x20;   "wl0\_dfs\_preism": "60",

&#x20;   "w2\_kponivl": "60",

&#x20;   "mqtt\_ser\_othercfg": "",

&#x20;   "ipsec\_failreboot": "30",

&#x20;   "AD7028-FS": "S9922S",

&#x20;   "AD7028-W": "S9922S",

&#x20;   "w2\_kpon\_lan\_dst": "192.168.254.1",

&#x20;   "eth1\_ipaddr": "0.0.0.0",

&#x20;   "openvpncl\_statickey": "",

&#x20;   "enc\_checkradom": "1",

&#x20;   "svqos\_port2prio": "10",

&#x20;   "wl0\_wds7\_enable": "0",

&#x20;   "cron\_enable": "1",

&#x20;   "wl0\_wme\_txp\_bk": "7 3 4 2 0",

&#x20;   "http\_lanport": "80",

&#x20;   "openvpncl\_proto": "udp",

&#x20;   "encdw\_link": "",

&#x20;   "port4tag": "0",

&#x20;   "filter\_mac\_grp1": "",

&#x20;   "openvpn\_detectlink": "1",

&#x20;   "openvpn\_config": "",

&#x20;   "openvpn\_tun\_clip": "10.8.0.1",

&#x20;   "ppp\_service": "",

&#x20;   "filter\_mac\_grp2": "",

&#x20;   "gps\_keygll": "1",

&#x20;   "mqtt\_pwdmode": "1",

&#x20;   "eth7\_ipaddr": "0.0.0.0",

&#x20;   "filter\_mac\_grp3": "",

&#x20;   "wan\_domain": "",

&#x20;   "wan\_hwname": "",

&#x20;   "mqtt\_serial\_num": "0",

&#x20;   "urlfilter\_ips\_amount\_temp": "",

&#x20;   "radiooff\_button": "0",

&#x20;   "wl0\_wds6\_hwaddr": "",

&#x20;   "wl0\_key1": "",

&#x20;   "wl0\_web\_filter": "0",

&#x20;   "filter\_mac\_grp4": "",

&#x20;   "m2\_wan\_netmask": "",

&#x20;   "ali\_iot\_product\_securt": "5e3nbgN3uytPrbrE",

&#x20;   "mqtt\_sub": "",

&#x20;   "lan\_lease": "86400",

&#x20;   "wl0\_key2": "",

&#x20;   "wl0\_vlan\_prio\_mode": "off",

&#x20;   "pppoe\_static\_ip": "",

&#x20;   "filter\_mac\_grp5": "",

&#x20;   "gps\_comflowctrl": "1",

&#x20;   "w2\_kpon\_lan\_ivl": "60",

&#x20;   "openvpncl\_tun\_netip": "",

&#x20;   "wl0\_txant": "3",

&#x20;   "ddns\_wildcard\_6": "",

&#x20;   "wl0\_key3": "",

&#x20;   "filter\_mac\_grp6": "",

&#x20;   "m1\_tempture": "75",

&#x20;   "ospf\_vtyareaauth": "0",

&#x20;   "m1s2conmode": "0",

&#x20;   "pptpd\_client\_srvsubmsk": "",

&#x20;   "enc\_iecifolen\_101": "2",

&#x20;   "ddns\_wildcard\_7": "",

&#x20;   "wl0\_key4": "",

&#x20;   "filter\_mac\_grp7": "",

&#x20;   "pppoe\_compression": "0",

&#x20;   "vrrp\_virip": "192.168.10.1",

&#x20;   "netauth\_ifname": "LAN",

&#x20;   "boot\_minutes": "0",

&#x20;   "wshaper\_nopriohostdst": "",

&#x20;   "l2tp\_forcemppe": "1",

&#x20;   "ddns\_url": "",

&#x20;   "wl0\_bridged": "1",

&#x20;   "filter\_mac\_grp8": "",

&#x20;   "filter\_client0": "",

&#x20;   "ali\_iot\_label\_val": "device",

&#x20;   "mqtt\_ser\_sysival": "10",

&#x20;   "AR7088-ASTD": "S9922L",

&#x20;   "eth3\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_lzo": "0",

&#x20;   "filter\_mac\_grp9": "",

&#x20;   "filter\_maclist": "",

&#x20;   "m2\_tempture": "75",

&#x20;   "gps\_rate": "5",

&#x20;   "AR7828": "AD7028V",

&#x20;   "m1s1pppuser": "card",

&#x20;   "enc\_iecifolen\_104": "3",

&#x20;   "wl0\_vifs": "",

&#x20;   "pptp\_pass": "1",

&#x20;   "ppp\_demand": "0",

&#x20;   "w1\_kponsec": "",

&#x20;   "m2s2conmode": "0",

&#x20;   "l2tpclt\_mppereq": "0",

&#x20;   "mtu\_enable": "0",

&#x20;   "w1\_recon": "0",

&#x20;   "ospf\_spfstart": "0",

&#x20;   "gps\_keyvtg": "1",

&#x20;   "AD7028-WS": "S9922S",

&#x20;   "enc\_checktime": "0",

&#x20;   "wl0\_br1\_nat": "0",

&#x20;   "mqtt\_pwd": "",

&#x20;   "encup\_listen": "28035",

&#x20;   "block\_activex": "0",

&#x20;   "m2s1pppuser": "card",

&#x20;   "gps\_comstopbit": "1",

&#x20;   "wl0\_wds5\_ipaddr": "",

&#x20;   "l2tp\_hostname": "Router",

&#x20;   "w1\_kpontrthold": "0",

&#x20;   "mqtt\_pub\_type": "0",

&#x20;   "wl0\_br1\_enable": "0",

&#x20;   "sshd\_forwarding": "0",

&#x20;   "remote\_mgt\_https": "0",

&#x20;   "wl0.1\_ipaddr": "0.0.0.0",

&#x20;   "http\_passwd": "$1$iWDB2Pre$IBKVvGPFapP2nCnxQW6Sh1",

&#x20;   "openvpn\_bind\_lan": "1",

&#x20;   "wl0\_wds10\_ipaddr": "",

&#x20;   "block\_wan": "0",

&#x20;   "ospf\_linkdead": "40",

&#x20;   "gps\_updspeed": "0",

&#x20;   "pptpclt\_mppestateless": "1",

&#x20;   "openvpncl\_remoteport": "1194",

&#x20;   "l2tp\_client\_keepivl": "60",

&#x20;   "wl0.3\_netmask": "0.0.0.0",

&#x20;   "mqtt\_mode": "0",

&#x20;   "lan\_stp": "0",

&#x20;   "eth7\_netmask": "0.0.0.0",

&#x20;   "wl0\_wme\_ap\_vi": "7 15 1 6016 3008 off",

&#x20;   "wl0.3\_radius\_ipaddr": "",

&#x20;   "wl0.3\_akm": "disabled",

&#x20;   "m2s2ppppwd": "card",

&#x20;   "enc\_remote\_adjust": "0",

&#x20;   "openvpncl\_mtu": "1500",

&#x20;   "skip\_amd\_check": "0",

&#x20;   "wl0.1\_radius\_key": "",

&#x20;   "pppoe\_assigngw": "0",

&#x20;   "ospf\_areaauth": "0",

&#x20;   "router\_style": "blue",

&#x20;   "encup\_sernum": "1",

&#x20;   "dtu\_showpkt": "0",

&#x20;   "openvpn\_cipher": "bf-cbc",

&#x20;   "forward\_spec": "",

&#x20;   "w2\_kponfailsw": "1",

&#x20;   "af\_dnatport": "0",

&#x20;   "openvpn\_tlscip": "0",

&#x20;   "port3tag": "0",

&#x20;   "vlanports": "1,0,1,1,1,1,,,,,;",

&#x20;   "l2tp\_server\_name": "",

&#x20;   "wl0.3\_wpa\_psk": "",

&#x20;   "wl0\_plcphdr": "long",

&#x20;   "wl0\_rate": "0",

&#x20;   "wl0\_closed": "0",

&#x20;   "AR7000-FS": "S9922M44-DOA",

&#x20;   "schedule\_enable": "0",

&#x20;   "wl0\_wds4\_netmask": "",

&#x20;   "wl0\_macmode": "disabled",

&#x20;   "vrrp\_enable": "0",

&#x20;   "pptpd\_client\_srvmru": "1450",

&#x20;   "wl0\_wme\_ap\_vo": "3 7 1 3264 1504 off",

&#x20;   "svqos\_port1bw": "FULL",

&#x20;   "pptpd\_radius": "0",

&#x20;   "ospf\_localid": "192.168.1.1",

&#x20;   "pam\_tacplus\_secret1": "router",

&#x20;   "mqtt\_ser\_dupmsg": "1",

&#x20;   "lan\_nat": "0",

&#x20;   "m1s1ppppwd": "card",

&#x20;   "m1s1band": "0",

&#x20;   "netauth\_authedtm": "2",

&#x20;   "dtu\_conn\_mode": "1",

&#x20;   "bulk\_rate\_dn": "1",

&#x20;   "block\_snmp": "1",

&#x20;   "wl0\_phytype": "g",

&#x20;   "m1simmain": "1",

&#x20;   "pam\_tacplus\_secret2": "",

&#x20;   "svqos\_macs\_amount\_temp": "",

&#x20;   "NC\_RouteOnly": "0",

&#x20;   "dr\_wan\_rx": "0",

&#x20;   "wl0\_lazywds": "0",

&#x20;   "filter\_tod\_buf1": "",

&#x20;   "ospf\_cost": "1",

&#x20;   "urlfilter\_amount\_temp": "",

&#x20;   "openvpncl\_mssfix": "",

&#x20;   "wds1.10": "",

&#x20;   "reboot\_tm": "60",

&#x20;   "block\_proxy": "0",

&#x20;   "filter\_tod\_buf2": "",

&#x20;   "lan\_cclass": "192.168.1.",

&#x20;   "NC\_GatewayPort": "5280",

&#x20;   "rflow\_port": "2055",

&#x20;   "snmpd\_syslocation": "Unknown",

&#x20;   "express\_rate\_dn": "15",

&#x20;   "wds1.11": "",

&#x20;   "filter\_tod\_buf3": "",

&#x20;   "w1\_connfailbt": "0",

&#x20;   "m1simswtch": "1",

&#x20;   "ntriplist\_flasht": "3600",

&#x20;   "pptpclt\_mppereq": "0",

&#x20;   "openvpncl\_keep\_wait": "120",

&#x20;   "qos\_type": "0",

&#x20;   "wds1.12": "",

&#x20;   "pptpd\_rip": "",

&#x20;   "filter\_tod\_buf4": "",

&#x20;   "w2\_kpontrthold": "0",

&#x20;   "ospf\_vtyretrmit": "5",

&#x20;   "traffic\_mac\_entries\_temp": "",

&#x20;   "wds1.13": "",

&#x20;   "filter\_tod\_buf5": "",

&#x20;   "ali\_iot\_serport": "443",

&#x20;   "netauth\_passwd": "123456",

&#x20;   "openvpn\_crl": "",

&#x20;   "dtu\_conn\_allon": "0",

&#x20;   "wds1.14": "",

&#x20;   "log\_filter": "mck",

&#x20;   "syslog\_detail": "0",

&#x20;   "dr\_lan\_tx": "0",

&#x20;   "wl0\_afterburner": "off",

&#x20;   "wl0\_netmask": "0.0.0.0",

&#x20;   "filter\_tod\_buf6": "",

&#x20;   "af\_serviceid": "0",

&#x20;   "openvpncl\_tuntap": "tun",

&#x20;   "NC\_SplashURLTimeout": "21600",

&#x20;   "wol\_macs": "",

&#x20;   "wds1.15": "",

&#x20;   "wl0\_wds8\_netmask": "",

&#x20;   "apwatchdog\_interval": "15",

&#x20;   "wl0\_antdiv": "3",

&#x20;   "filter\_tod\_buf7": "",

&#x20;   "filter\_tod10": "",

&#x20;   "AR7000-WP": "S1000-MEB",

&#x20;   "radio1\_timer\_enable": "0",

&#x20;   "encdw\_mode": "3",

&#x20;   "dtu\_ifolen\_101": "2",

&#x20;   "wds1.16": "",

&#x20;   "tcp\_retries2": "15",

&#x20;   "wl0.1\_auth\_mode": "disabled",

&#x20;   "filter\_tod\_buf8": "",

&#x20;   "wan\_dns": "",

&#x20;   "pppoe\_mlppp": "0",

&#x20;   "w1\_kpon\_lan\_mode": "1",

&#x20;   "filter\_tod\_buf9": "",

&#x20;   "mullinkfail": "30",

&#x20;   "enc\_up\_baudrate": "10",

&#x20;   "dtu\_proto\_parse": "1",

&#x20;   "wl0.1\_akm": "disabled",

&#x20;   "AR7000-WS": "S9922XL",

&#x20;   "dtu\_ifolen\_104": "3",

&#x20;   "dtu\_compat\_mode": "0",

&#x20;   "ip\_conntrack\_max": "4096",

&#x20;   "ipv6\_enable0": "0",

&#x20;   "wl0\_wds8\_desc": "",

&#x20;   "dial\_demand": "1",

&#x20;   "forward\_entries": "0",

&#x20;   "dhcpd\_usenvram": "0",

&#x20;   "wl0\_wpa\_psk": "1234567890",

&#x20;   "wl0.2\_crypto": "off",

&#x20;   "w2\_kponcount": "5",

&#x20;   "log\_dropped": "0",

&#x20;   "schedule\_bs\_enable": "0",

&#x20;   "wl0\_wds2\_enable": "0",

&#x20;   "ali\_iot\_retry\_invalms": "100",

&#x20;   "bgp\_localid": "192.168.1.1",

&#x20;   "wait\_time": "5",

&#x20;   "openvpn\_crt": "",

&#x20;   "openvpncl\_auth": "sha1",

&#x20;   "cloud\_servip": "78.186.62.169",

&#x20;   "pptpd\_radport": "1812",

&#x20;   "ali\_iot\_rekpivl": "80",

&#x20;   "vrrp\_interface": "1",

&#x20;   "gps\_check\_link\_mode": "1",

&#x20;   "pptpclt\_chap": "1",

&#x20;   "openvpn\_detectimes": "2",

&#x20;   "bulk\_rate\_up": "1",

&#x20;   "m2m\_srvip": "58.215.16.142",

&#x20;   "dns\_dnsmasq": "1",

&#x20;   "dtu\_short\_link\_tmot": "180",

&#x20;   "macupd\_ip": "0.0.0.0",

&#x20;   "wl0.2\_auth": "0",

&#x20;   "mqtt\_clean": "1",

&#x20;   "daylight\_time": "1",

&#x20;   "ipsecport\_bind": "0",

&#x20;   "l2tpclt\_bind": "0",

&#x20;   "af\_address\_2": "",

&#x20;   "eth2\_ipaddr": "0.0.0.0",

&#x20;   "dtu\_mode": "0",

&#x20;   "packetfilter\_policy": "DROP",

&#x20;   "wl0\_wds9\_if": "",

&#x20;   "security\_mode": "disabled",

&#x20;   "dhcp\_wins": "wan",

&#x20;   "eth0\_bridged": "1",

&#x20;   "upgrade\_delay": "1200",

&#x20;   "port2tag": "0",

&#x20;   "express\_rate\_up": "15",

&#x20;   "wl0\_wds1\_hwaddr": "",

&#x20;   "wl0\_wds8\_enable": "0",

&#x20;   "filter\_tod\_buf10": "",

&#x20;   "os\_server": "",

&#x20;   "AR7000-A": "S9922XL",

&#x20;   "fon\_usernames": "0",

&#x20;   "enc\_up\_stopbit": "1",

&#x20;   "pppoe\_static": "0",

&#x20;   "w1\_connfailsw": "10",

&#x20;   "mqtt\_pk": "",

&#x20;   "w1\_kpon\_lan\_dst": "",

&#x20;   "shutdown\_week\_e": "0",

&#x20;   "remote\_mgt\_ssh": "1",

&#x20;   "hb\_server\_domain": "",

&#x20;   "port\_swap": "0",

&#x20;   "enc\_conn\_rtnmain": "0",

&#x20;   "dtu\_inval1": "100",

&#x20;   "AR7000-D": "S9922XL",

&#x20;   "eth8\_ipaddr": "0.0.0.0",

&#x20;   "mmc\_enable": "0",

&#x20;   "ospfd\_conf": "",

&#x20;   "wl0\_unit": "0",

&#x20;   "w1\_kponfst": "8.8.8.8",

&#x20;   "ntrip\_serv\_port": "",

&#x20;   "mqtt\_ser\_maxinfmsg": "20",

&#x20;   "AR7000-E": "S9922XL",

&#x20;   "web\_proto\_simple": "1",

&#x20;   "shutdown\_week": "0",

&#x20;   "macfilter\_enable": "0",

&#x20;   "wshaper\_noprioportsrc": "",

&#x20;   "wds0.10": "",

&#x20;   "wl0\_wds7\_hwaddr": "",

&#x20;   "ospf\_linkhello": "10",

&#x20;   "AR7000-F": "S9922XL",

&#x20;   "NC\_IncludePorts": "",

&#x20;   "dtu\_baudrate1": "10",

&#x20;   "ar\_restore\_defaults": "0",

&#x20;   "wds0.11": "",

&#x20;   "wl0\_wds6\_desc": "",

&#x20;   "wl0\_txpwr": "71",

&#x20;   "ntrip\_serv\_mountpoint": "",

&#x20;   "pptpd\_client\_srvpass": "",

&#x20;   "enable\_jffs2": "0",

&#x20;   "wds0.12": "",

&#x20;   "dtu\_baudrate": "10",

&#x20;   "wds0.13": "",

&#x20;   "static\_route\_name": "",

&#x20;   "w1\_kpon\_lan\_ivl": "60",

&#x20;   "snmp\_trap\_port": "162",

&#x20;   "eth4\_bridged": "1",

&#x20;   "wds0.14": "",

&#x20;   "openvpn\_cl2cl": "1",

&#x20;   "packetfilter\_enable": "0",

&#x20;   "wds0.15": "",

&#x20;   "wl0\_nmode": "-1",

&#x20;   "m1s2pppuser": "card",

&#x20;   "AR7000-ESP": "S1000-MEB",

&#x20;   "enc\_conn\_mode": "0",

&#x20;   "wds0.16": "",

&#x20;   "ntp\_enable": "1",

&#x20;   "gre\_conns": "",

&#x20;   "enable\_game": "0",

&#x20;   "dtu\_mtu": "1024",

&#x20;   "language\_list": "english,",

&#x20;   "ospf\_vtyauthpwd": "123456",

&#x20;   "l2tpclt\_mppe56b": "1",

&#x20;   "remote\_ip": "0.0.0.0 0",

&#x20;   "mqtt\_ser\_inval": "20",

&#x20;   "wl0\_wds6\_ipaddr": "",

&#x20;   "ddns\_custom\_5": "",

&#x20;   "forward\_port": "",

&#x20;   "m2s2pppuser": "card",

&#x20;   "ospf\_vtyauthmd5key": "1",

&#x20;   "ipsec\_lonat": "0",

&#x20;   "NC\_HomePage": "",

&#x20;   "smtp\_redirect\_enable": "0",

&#x20;   "sys\_enable\_jffs2": "0",

&#x20;   "cloud\_heart\_tm": "8",

&#x20;   "l2tp\_client\_keepip": "",

&#x20;   "gps\_keyrmc": "1",

&#x20;   "mqtt\_ser\_debug": "information",

&#x20;   "m2m\_devnum": "00EE0000000100000007",

&#x20;   "m2m\_srvport": "15695",

&#x20;   "wshaper\_dev": "WAN",

&#x20;   "wl0.2\_ipaddr": "0.0.0.0",

&#x20;   "openvpn\_nat": "0",

&#x20;   "schedule\_mode": "1",

&#x20;   "limit\_pptp": "0",

&#x20;   "ntrip\_account": "",

&#x20;   "AR7088H-FS": "S99MC2X-LTE",

&#x20;   "AR7088-WSTD": "S9922L",

&#x20;   "eth8\_bridged": "1",

&#x20;   "ali\_iot\_dakpivl": "60",

&#x20;   "ali\_iot\_product\_key": "a1WJKqg0uI4",

&#x20;   "pam\_tacplus\_localauth": "0",

&#x20;   "boot\_week": "0",

&#x20;   "snmpd\_sysname": "Router",

&#x20;   "wl0\_wds8\_ospf": "",

&#x20;   "wl0\_wds4\_desc": "",

&#x20;   "wl0\_wds": "",

&#x20;   "filter\_mac\_grp10": "",

&#x20;   "m2\_ppp3g\_assign": "0",

&#x20;   "bgp\_localas": "7676",

&#x20;   "ntrip\_csmodel": "1",

&#x20;   "snmp\_trap\_enable": "0",

&#x20;   "pptp\_server\_name": "",

&#x20;   "port3vlan": "1",

&#x20;   "wl0\_wds8\_if": "",

&#x20;   "ddns\_dyndnstype\_6": "",

&#x20;   "ppp\_static\_ip": "",

&#x20;   "static\_wan\_dns": "",

&#x20;   "ospf\_network": "192.168.1.0/24",

&#x20;   "mqtt\_keepalive": "60",

&#x20;   "m1s1wanapn\_cst": "internet",

&#x20;   "openvpncl\_tun\_clip": "10.8.0.2",

&#x20;   "port1tag": "0",

&#x20;   "telnetd\_enable": "1",

&#x20;   "block\_java": "0",

&#x20;   "log\_level": "0",

&#x20;   "AR7000-ASP": "S1000-MEB",

&#x20;   "dtu\_servport": "6001",

&#x20;   "hs\_urls": "",

&#x20;   "wl0\_reg\_mode": "off",

&#x20;   "m2\_chap\_allowed": "1",

&#x20;   "ntp\_server": "0.tr.pool.ntp.org",

&#x20;   "ct\_modules": "",

&#x20;   "AR7000-W": "S9922XL",

&#x20;   "base\_station\_time": "-1",

&#x20;   "upgrade\_delay\_sec": "10",

&#x20;   "openvpn\_ccddef": "",

&#x20;   "standard\_rate\_dn": "10",

&#x20;   "ApCliKeyType": "0",

&#x20;   "eth0\_netmask": "0.0.0.0",

&#x20;   "NC\_GatewayName": "ARxxx",

&#x20;   "m1\_bstiming": "0",

&#x20;   "mqtt\_comdatabit": "1",

&#x20;   "eth10\_ipaddr": "0.0.0.0",

&#x20;   "remote\_mgt\_telnet": "1",

&#x20;   "sshd\_dss\_host\_key": "",

&#x20;   "l2tp\_client\_srvsubmsk": "",

&#x20;   "m2simmain": "1",

&#x20;   "lan\_netmask\_ex1": "255.255.255.0",

&#x20;   "openvpn\_wait\_on": "300",

&#x20;   "wl0\_wme": "on",

&#x20;   "dtu\_conn\_rtnmain": "0",

&#x20;   "snmpd\_enable": "0",

&#x20;   "cloud\_iface": "0",

&#x20;   "flow\_write\_fixhour": "23",

&#x20;   "wl0\_radius\_port": "1812",

&#x20;   "wl0\_auth": "0",

&#x20;   "m2\_bstiming": "0",

&#x20;   "ipsec\_tmout": "300",

&#x20;   "lan\_netmask\_ex2": "0.0.0.0",

&#x20;   "custpro": "Router",

&#x20;   "openvpncl\_adv": "0",

&#x20;   "smtp\_source\_network": "0.0.0.0",

&#x20;   "lan\_netmask\_ex3": "0.0.0.0",

&#x20;   "af\_email": "",

&#x20;   "openvpn\_mssfix": "",

&#x20;   "openvpncl\_debug\_level": "4",

&#x20;   "sshd\_port": "22",

&#x20;   "wl0\_radius\_ipaddr": "",

&#x20;   "m2s2band": "0",

&#x20;   "wshaper\_noprioportdst": "",

&#x20;   "cron\_jobs": "",

&#x20;   "pppoe\_service": "",

&#x20;   "m2\_ims": "0",

&#x20;   "gps\_netproto": "1",

&#x20;   "pptpclt\_mppe56b": "1",

&#x20;   "wl0\_wme\_sta\_vi": "7 15 2 6016 3008 off",

&#x20;   "svqos\_macs": "",

&#x20;   "openvpn\_gateway": "0.0.0.0",

&#x20;   "wl0\_wds6\_ospf": "",

&#x20;   "wl0\_wds2\_desc": "",

&#x20;   "bgp\_syn": "0",

&#x20;   "gps\_updivl": "60",

&#x20;   "loopback\_ipaddr": "127.0.0.1",

&#x20;   "sysver": "8171",

&#x20;   "eth4\_netmask": "0.0.0.0",

&#x20;   "wl0.3\_wpa\_gtk\_rekey": "3600",

&#x20;   "af\_enable": "0",

&#x20;   "openvpn\_tuntap": "tun",

&#x20;   "schedule\_weekdays": "00",

&#x20;   "w2\_kponsec": "",

&#x20;   "w1\_lnkp": "1",

&#x20;   "m1detfail": "360",

&#x20;   "exempt\_rate\_dn": "100",

&#x20;   "remote\_management": "1",

&#x20;   "KeyType": "0",

&#x20;   "wan\_ifnames": "vlan0",

&#x20;   "radio0\_timer\_enable": "0",

&#x20;   "wl0\_wme\_sta\_vo": "3 7 2 3264 1504 off",

&#x20;   "NC\_ExcludePorts": "25",

&#x20;   "schedule\_time": "3600",

&#x20;   "port1vlan": "1",

&#x20;   "hs\_enable": "",

&#x20;   "svqos\_port4bw": "FULL",

&#x20;   "block\_loopback": "0",

&#x20;   "pptpd\_client\_reconivl": "10",

&#x20;   "pro\_gwlk": "{gw:\[{pro:,lk:\[{pro:,dev:\[{dname:,daddr:,reg:\[]}],rtu:{rtu\_pro:\[],rtu\_chl:\[],rtu\_ctl:\[],rtu\_algo:\[],rtu\_rain:\[],rtu\_modb:\[],rtu\_modbc:\[],rtu\_adc:\[],rtu\_sdi:\[],rtu\_ftu:\[],rtu\_mcup:\[],rtu\_mcuf:\[],rtu\_gnss:\[]}}],net:\[]}],reg:\[],ser:\[]}",

&#x20;   "dtu\_short\_link\_activate": "0",

&#x20;   "standard\_rate\_up": "10",

&#x20;   "wl0\_wds1\_netmask": "",

&#x20;   "l2tp\_client\_srvsub": "",

&#x20;   "wl0.3\_crypto": "off",

&#x20;   "gps\_comparity": "1",

&#x20;   "wl0\_wds3\_enable": "0",

&#x20;   "wl0.2\_key": "1",

&#x20;   "ospf\_enable": "0",

&#x20;   "wifi\_bonding": "0",

&#x20;   "svqos\_svcs": "",

&#x20;   "http\_method": "post",

&#x20;   "eth8\_netmask": "0.0.0.0",

&#x20;   "enc\_iecrsnlen\_101": "2",

&#x20;   "hs\_exempt": "",

&#x20;   "wl0\_wds7\_if": "",

&#x20;   "http\_chkivl": "120",

&#x20;   "port0tag": "0",

&#x20;   "filter\_port\_grp1": "",

&#x20;   "gps\_combaud": "10",

&#x20;   "mqtt\_ser\_maxquemsg": "100",

&#x20;   "lan\_ipaddr": "192.168.1.1",

&#x20;   "lan\_proto": "dhcp",

&#x20;   "eth3\_ipaddr": "0.0.0.0",

&#x20;   "pptpd\_client\_srvmtu": "1450",

&#x20;   "wl0\_maxassoc": "128",

&#x20;   "wl0\_wds9\_enable": "0",

&#x20;   "filter\_port\_grp2": "",

&#x20;   "rip\_garbagetimer": "120",

&#x20;   "wanlink\_nat": "3",

&#x20;   "ipsec\_detectlink": "1",

&#x20;   "vlan1hwname": "et0",

&#x20;   "portprio\_support": "0",

&#x20;   "enc\_iecrsnlen\_104": "2",

&#x20;   "wl0\_wds2\_hwaddr": "",

&#x20;   "ddns\_passwd\_2": "",

&#x20;   "filter\_port\_grp10": "",

&#x20;   "filter\_port\_grp3": "",

&#x20;   "w2\_kponm": "1",

&#x20;   "filter\_id": "1",

&#x20;   "openvpn\_auth": "sha1",

&#x20;   "trigger\_entries": "0",

&#x20;   "clean\_jffs2": "0",

&#x20;   "wl0\_wds4\_ospf": "",

&#x20;   "reboot\_inter": "1",

&#x20;   "ddns\_passwd\_3": "",

&#x20;   "dr\_wan\_tx": "0",

&#x20;   "wl0.3\_ssid": "",

&#x20;   "filter\_port\_grp4": "",

&#x20;   "mqtt\_comflowctrl": "1",

&#x20;   "urlfilter\_entries\_temp": "",

&#x20;   "wol\_enable": "0",

&#x20;   "ddns\_passwd\_4": "",

&#x20;   "wl0\_max\_unauth\_users": "0",

&#x20;   "wl0\_phytypes": "",

&#x20;   "filter\_port\_grp5": "",

&#x20;   "eth9\_ipaddr": "0.0.0.0",

&#x20;   "enc\_up\_parity": "1",

&#x20;   "premium\_rate\_dn": "75",

&#x20;   "wl0\_wds5\_netmask": "",

&#x20;   "ddns\_passwd\_5": "",

&#x20;   "wl0\_frag": "2346",

&#x20;   "filter\_port\_grp6": "",

&#x20;   "maskmac": "1",

&#x20;   "syslogd\_enable": "3",

&#x20;   "l2tp\_client\_reconivl": "10",

&#x20;   "ddns\_passwd\_6": "",

&#x20;   "ddns\_username": "",

&#x20;   "wl0.1\_closed": "0",

&#x20;   "filter\_port\_grp7": "",

&#x20;   "m2s1ppppwd": "card",

&#x20;   "ospf\_vtyenable": "0",

&#x20;   "ipsec\_wait\_on": "300",

&#x20;   "wl0\_wds8\_hwaddr": "",

&#x20;   "l2tp\_client\_nat": "1",

&#x20;   "l2tp\_lip": "",

&#x20;   "ddns\_passwd\_7": "",

&#x20;   "ddns\_passwd": "",

&#x20;   "filter\_port\_grp8": "",

&#x20;   "m2\_ppp3g\_assigngw": "0",

&#x20;   "ospf\_linkretrmit": "5",

&#x20;   "openvpn\_tmout": "300",

&#x20;   "pro\_cache\_en": "0",

&#x20;   "l2tpclt\_mppe128b": "1",

&#x20;   "ddns\_passwd\_8": "",

&#x20;   "block\_ident": "1",

&#x20;   "wl0\_distance": "2000",

&#x20;   "wl0\_nbw": "20",

&#x20;   "filter\_port\_grp9": "",

&#x20;   "w1\_kponretry": "4",

&#x20;   "pppoe\_assign": "0",

&#x20;   "gps\_keygga": "1",

&#x20;   "m2m\_heartint": "30",

&#x20;   "gre\_nat\_en": "0",

&#x20;   "auth\_dnsmasq": "1",

&#x20;   "dhcpfwd\_enable": "0",

&#x20;   "dtu\_cli\_tmot": "120",

&#x20;   "hs\_image": "",

&#x20;   "exempt\_rate\_up": "100",

&#x20;   "ppp\_ac": "",

&#x20;   "m2simswtch": "0",

&#x20;   "log\_enable": "0",

&#x20;   "sip\_domain": "192.168.1.1",

&#x20;   "wl0\_wds10\_if": "",

&#x20;   "filter\_web\_url10": "",

&#x20;   "ospf\_spfmax": "5000",

&#x20;   "wl0\_wds1\_ipaddr": "",

&#x20;   "dmz\_ipaddr": "0",

&#x20;   "gps\_en": "1",

&#x20;   "mqtt\_ser\_maxmsg": "1024",

&#x20;   "AR7100F": "AR7091F",

&#x20;   "pptpd\_client\_enable": "0",

&#x20;   "openvpn\_switch": "0",

&#x20;   "schedule\_hours": "0",

&#x20;   "sshd\_passwd\_auth": "1",

&#x20;   "rc\_startup": "",

&#x20;   "security\_mode\_last": "",

&#x20;   "wl0.3\_key1": "",

&#x20;   "AR7100G": "AR7091G",

&#x20;   "wol\_interval": "86400",

&#x20;   "wl0\_wds9\_netmask": "",

&#x20;   "sshd\_enable": "0",

&#x20;   "ddns\_hostname\_2": "",

&#x20;   "wl0.1\_radius\_ipaddr": "",

&#x20;   "wl0.3\_key2": "",

&#x20;   "ntrip\_netport": "",

&#x20;   "ddns\_hostname\_3": "",

&#x20;   "wl0.3\_key3": "",

&#x20;   "w1\_kpon\_lan\_switch": "10",

&#x20;   "af\_category": "0",

&#x20;   "radiooff\_boot\_off": "0",

&#x20;   "shutdown\_minutes": "0",

&#x20;   "l2tpclt\_pap": "0",

&#x20;   "l2tp\_client\_srvsec": "",

&#x20;   "ddns\_hostname\_4": "",

&#x20;   "wl0.3\_key4": "",

&#x20;   "AD7028-AS": "S9922S",

&#x20;   "dtu\_downlink\_port": "6003",

&#x20;   "wl0\_wds2\_ospf": "",

&#x20;   "wl0\_wds7\_ipaddr": "",

&#x20;   "ddns\_hostname\_5": "",

&#x20;   "wl0\_rateset": "default",

&#x20;   "wl0.1\_ssid": "",

&#x20;   "m1s2wanapn": "internet",

&#x20;   "enc\_conn\_timeout": "30",

&#x20;   "log\_allow": "",

&#x20;   "ddns\_hostname\_6": "",

&#x20;   "pptpd\_client\_srvuser": "User",

&#x20;   "wl0\_wme\_apsd": "on",

&#x20;   "macupd\_port": "2056",

&#x20;   "cloud\_heartenable": "1",

&#x20;   "ddns\_hostname\_7": "",

&#x20;   "wl0.3\_ipaddr": "0.0.0.0",

&#x20;   "ospf\_intenable": "0",

&#x20;   "openvpncl\_keep\_invl": "10",

&#x20;   "wl0\_wme\_txp\_vi": "7 3 4 2 0",

&#x20;   "pptpd\_acctport": "1813",

&#x20;   "ddns\_hostname\_8": "",

&#x20;   "ntrip\_password": "",

&#x20;   "premium\_rate\_up": "75",

&#x20;   "wl0\_wds6\_if": "",

&#x20;   "flow\_write\_ivl": "60",

&#x20;   "pppoe\_idletime": "5",

&#x20;   "ali\_iot\_ip0": "127.0.0.1",

&#x20;   "ping\_times": "",

&#x20;   "ali\_iot\_ip1": "127.0.0.1",

&#x20;   "rip\_enable": "0",

&#x20;   "pptpd\_client\_nat": "1",

&#x20;   "openvpn\_detectinval": "60",

&#x20;   "openvpn\_tlsauth": "",

&#x20;   "fullswitch": "0",

&#x20;   "lan\_ifname": "br0",

&#x20;   "procon\_cfgfile": "/etc/exdisk/m2mprocon/prodb",

&#x20;   "openvpn\_tun\_serip": "10.8.0.2",

&#x20;   "filter\_services": "",

&#x20;   "m1\_ppp3g\_assign": "0",

&#x20;   "openvpn\_onwan": "0",

&#x20;   "dtu\_rsnlen\_101": "2",

&#x20;   "dtu\_inval": "100",

&#x20;   "pptp\_extraoptions": "",

&#x20;   "gps\_devid": "18912345678",

&#x20;   "eth1\_bridged": "1",

&#x20;   "wl0\_wme\_txp\_vo": "7 3 4 2 0",

&#x20;   "encup\_checkdiscon": "0",

&#x20;   "pptp\_reorder": "1",

&#x20;   "wl0\_radius\_override": "1",

&#x20;   "wl0.1\_key1": "",

&#x20;   "dhcp\_domain": "wan",

&#x20;   "mqtt\_ser\_maxcnt": "16",

&#x20;   "mqtt\_proto": "1",

&#x20;   "AR7088-A": "S9922L",

&#x20;   "wl0.1\_key2": "",

&#x20;   "rip\_interfacename": "0",

&#x20;   "fon\_userlist": "",

&#x20;   "dtu\_rsnlen\_104": "2",

&#x20;   "samba\_mount": "0",

&#x20;   "wl0.1\_key3": "",

&#x20;   "wan\_pdp\_type": "IPV4V6",

&#x20;   "m1\_chap\_allowed": "1",

&#x20;   "openvpncl\_bridge": "0",

&#x20;   "wl0.1\_key4": "",

&#x20;   "pam\_deny": "0",

&#x20;   "AR7088-D": "S9922L",

&#x20;   "warn\_connlimit": "500",

&#x20;   "encup\_hearttime": "60",

&#x20;   "dtu\_stopbit1": "1",

&#x20;   "resetbutton\_enable": "1",

&#x20;   "block\_cookie": "0",

&#x20;   "w2\_kponfst": "",

&#x20;   "wan\_vdsl": "0",

&#x20;   "ospf\_linkauth": "0",

&#x20;   "AR7088-E": "S9922L",

&#x20;   "dtu\_srv\_txqtm1": "0",

&#x20;   "rc\_firewall": "",

&#x20;   "l2tp\_client\_assign": "0",

&#x20;   "mqtt\_ser\_mode": "0",

&#x20;   "mqtt\_comstopbit": "1",

&#x20;   "ezc\_enable": "1",

&#x20;   "AR7088-F": "S9922L",

&#x20;   "openvpn\_ip": "",

&#x20;   "NC\_enable": "0",

&#x20;   "wl0\_nmode\_protection": "auto",

&#x20;   "gps\_net": "0",

&#x20;   "wl1\_ssid": "Ricon-WiFi",

&#x20;   "dtu\_cache": "1",

&#x20;   "w2\_dns": "0.0.0.0",

&#x20;   "mqtt\_client\_id": "",

&#x20;   "eth5\_bridged": "1",

&#x20;   "wl0.1\_bridged": "1",

&#x20;   "ospf\_linkauthpwd": "123",

&#x20;   "smtp\_redirect\_destination": "0.0.0.0",

&#x20;   "svqos\_port3prio": "10",

&#x20;   "wl0.2\_radius\_key": "",

&#x20;   "dhcp\_num": "2",

&#x20;   "filter\_web\_url1": "",

&#x20;   "openvpn\_proxy": "0",

&#x20;   "openvpn\_mask": "0.0.0.0",

&#x20;   "filter\_web\_url2": "",

&#x20;   "pppoe\_redialperiod": "30",

&#x20;   "AR7000-DSP": "S1000-MEB",

&#x20;   "et0macaddr\_safe": "00:0C:43:43:5F:4E",

&#x20;   "dnsfilter\_policy": "DROP",

&#x20;   "filter\_web\_url3": "",

&#x20;   "AR7000-AP": "S1000-MEB",

&#x20;   "af\_country": "",

&#x20;   "wl0\_rts": "2347",

&#x20;   "filter\_web\_url4": "",

&#x20;   "m2detfail": "360",

&#x20;   "tcp\_congestion\_control": "vegas",

&#x20;   "w2\_kpon\_lan\_mode": "2",

&#x20;   "af\_ssid\_name": "AnchorFree WiFi",

&#x20;   "ospfd\_copt": "1",

&#x20;   "zebra\_conf": "",

&#x20;   "filter\_web\_url5": "",

&#x20;   "mulinkallon": "2",

&#x20;   "m1s1wandial": "0",

&#x20;   "fon\_enable": "0",

&#x20;   "filter\_web\_url6": "",

&#x20;   "wan\_wins": "0.0.0.0",

&#x20;   "ipsec\_detectimes": "2",

&#x20;   "AR7000-AS": "S9922XL",

&#x20;   "openvpn\_port": "1194",

&#x20;   "snmpd\_syscontact": "root",

&#x20;   "wds1.1": "",

&#x20;   "wl0\_wds4\_enable": "0",

&#x20;   "ipv6\_enable": "0",

&#x20;   "ntp\_mode": "auto",

&#x20;   "http\_enable": "1",

&#x20;   "filter\_web\_url7": "",

&#x20;   "wds1.2": "",

&#x20;   "wl0\_wds5\_if": "",

&#x20;   "wl0\_radauth": "0",

&#x20;   "l2tp\_pass": "1",

&#x20;   "filter\_web\_url8": "",

&#x20;   "pppoe\_mppe": "",

&#x20;   "eth9\_bridged": "1",

&#x20;   "svqos\_ips": "",

&#x20;   "wds1.3": "",

&#x20;   "ddns\_dyndnstype": "",

&#x20;   "wl0.2\_auth\_mode": "disabled",

&#x20;   "filter\_web\_url9": "",

&#x20;   "m2s1wandial": "card",

&#x20;   "pptpd\_client\_rebootivl": "30",

&#x20;   "enc\_mode": "0",

&#x20;   "wds1.4": "",

&#x20;   "ntpserver\_enable": "0",

&#x20;   "l2tp\_use\_dhcp": "0",

&#x20;   "w2\_connfailbt": "0",

&#x20;   "ntrip\_serv\_password": "",

&#x20;   "gps\_com": "0",

&#x20;   "eth4\_ipaddr": "0.0.0.0",

&#x20;   "encup\_devid": "",

&#x20;   "wds1.5": "",

&#x20;   "sshd\_rsa\_host\_key": "",

&#x20;   "wl0\_wpa\_gtk\_rekey": "3600",

&#x20;   "ipsec\_link": "3",

&#x20;   "wds1.6": "",

&#x20;   "l2tpclt\_mppestateless": "1",

&#x20;   "mac\_clone\_enable": "0",

&#x20;   "wl0\_sta\_retry\_time": "5",

&#x20;   "ppp\_get\_srv": "",

&#x20;   "ospf\_vtydead": "40",

&#x20;   "bgp\_ebgpmultihop": "0",

&#x20;   "mqtt\_com": "1",

&#x20;   "wds1.7": "",

&#x20;   "wl0\_wds3\_hwaddr": "",

&#x20;   "wds1.8": "",

&#x20;   "wan\_mtu": "1500",

&#x20;   "wl0\_key": "1",

&#x20;   "AR7088-W": "S9922L",

&#x20;   "AR7000-WSP": "S1000-MEB",

&#x20;   "eth1\_netmask": "0.0.0.0",

&#x20;   "openvpn\_key": "",

&#x20;   "openvpncl\_nat": "0",

&#x20;   "dnsfilter\_enable": "0",

&#x20;   "wds1.9": "",

&#x20;   "static\_wan\_ipaddr": "192.168.20.100",

&#x20;   "pptpclt\_mppe128b": "1",

&#x20;   "openvpn\_tun\_netmask": "",

&#x20;   "syslog\_pri\_ker": "4",

&#x20;   "filter\_macmode": "deny",

&#x20;   "wl0\_wds9\_hwaddr": "",

&#x20;   "wl0.2\_closed": "0",

&#x20;   "svqos\_port1prio": "10",

&#x20;   "NC\_LoginTimeout": "86400",

&#x20;   "enc\_sertm": "200",

&#x20;   "debuglog\_enable": "1",

&#x20;   "sshd\_wanport": "22",

&#x20;   "dnsmasq\_options": "",

&#x20;   "rip\_version": "1",

&#x20;   "time\_zone": "+03",

&#x20;   "openvpn\_statickey": "",

&#x20;   "pam\_tacplus\_ser1": "",

&#x20;   "dtu\_srv\_tmot": "2700",

&#x20;   "dtu\_parity1": "1",

&#x20;   "boot\_day\_e": "1",

&#x20;   "l2tp\_username": "User",

&#x20;   "m1\_ipv4v6": "0",

&#x20;   "pam\_tacplus\_ser2": "",

&#x20;   "mqtt\_user": "",

&#x20;   "af\_state": "",

&#x20;   "ttraff\_enable": "0",

&#x20;   "wl0\_wds2\_ipaddr": "",

&#x20;   "ali\_iot\_name0": "telnet\_local",

&#x20;   "traffic\_mac\_amount\_temp": "",

&#x20;   "netauth\_enable": "0",

&#x20;   "wl0.1\_netmask": "0.0.0.0",

&#x20;   "ali\_iot\_name1": "http\_localhost",

&#x20;   "wan\_ifname": "vlan0",

&#x20;   "eth5\_netmask": "0.0.0.0",

&#x20;   "enc\_iecaddlen\_101": "2",

&#x20;   "dtu\_srv\_heart1": "60",

&#x20;   "sshd\_authorized\_keys": "",

&#x20;   "radvd\_enable": "0",

&#x20;   "flow\_enable": "0",

&#x20;   "rip\_timeouttimer": "180",

&#x20;   "af\_ssid": "0",

&#x20;   "bulk\_ceil\_dn": "1",

&#x20;   "wl0\_dfs\_postism": "60",

&#x20;   "wan\_hostname": "",

&#x20;   "w2\_connfailsw": "10",

&#x20;   "m1s2band": "0",

&#x20;   "openvpn\_certauthmode": "0",

&#x20;   "openvpn\_tun\_netip": "",

&#x20;   "wl0\_wds8\_ipaddr": "",

&#x20;   "wl0\_radio": "1",

&#x20;   "af\_address": "",

&#x20;   "dtu\_databit": "1",

&#x20;   "zebra\_enable": "1",

&#x20;   "info\_passwd": "0",

&#x20;   "wl0.1\_wpa\_psk": "",

&#x20;   "login\_username": "riconadmin",

&#x20;   "wl0\_wds0": "",

&#x20;   "express\_ceil\_dn": "15",

&#x20;   "svqos\_port3bw": "FULL",

&#x20;   "wl0\_wds4\_if": "",

&#x20;   "wl0\_wds2\_netmask": "",

&#x20;   "wl0\_wds1": "",

&#x20;   "dtu\_check\_link\_mode": "1",

&#x20;   "shutdown\_day": "0",

&#x20;   "manual\_boot\_nv": "0",

&#x20;   "wl0\_bcn": "100",

&#x20;   "wl0\_wds2": "",

&#x20;   "flow\_memory": "1",

&#x20;   "openvpncl\_route": "",

&#x20;   "snmpd\_conf": "See http://www.net-snmp.org for expert snmpd.conf options",

&#x20;   "syslog\_to\_flash": "0",

&#x20;   "pptpd\_auth": "",

&#x20;   "l2tp\_auth": "",

&#x20;   "m1\_pap\_allowed": "1",

&#x20;   "wl0\_wds3": "",

&#x20;   "radio0\_on\_time": "111111111111111111111111",

&#x20;   "openvpn\_remode": "0",

&#x20;   "enc\_conn\_allon": "0",

&#x20;   "macupd\_interval": "10",

&#x20;   "reboot\_enable": "1",

&#x20;   "block\_multicast": "1",

&#x20;   "ppp\_static": "0",

&#x20;   "filter\_tod1": "",

&#x20;   "dtag\_vlan8": "0",

&#x20;   "wl0\_wds4": "",

&#x20;   "eth9\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_certauthmode": "0",

&#x20;   "dyn\_default": "0",

&#x20;   "flow\_write\_fixmins": "50",

&#x20;   "filter\_tod2": "",

&#x20;   "pam\_tacplus\_port1": "49",

&#x20;   "log\_rejected": "0",

&#x20;   "AR7100": "AR7091",

&#x20;   "wl0\_wds5": "",

&#x20;   "openvpn\_authmode": "0",

&#x20;   "l2tp\_client\_srvmru": "1450",

&#x20;   "filter\_tod3": "",

&#x20;   "w1\_wan\_proto": "m13gdhcp",

&#x20;   "pam\_tacplus\_port2": "49",

&#x20;   "AD7828D": "AD7028D",

&#x20;   "wl0\_wds6": "",

&#x20;   "pptpclt\_pap": "1",

&#x20;   "dtu\_srv\_heart": "60",

&#x20;   "m1\_chapms\_v2\_allowed": "1",

&#x20;   "filter\_tod4": "",

&#x20;   "mqtt\_tlsproto": "tlsv1",

&#x20;   "ezc\_version": "2",

&#x20;   "wl0\_wds7": "",

&#x20;   "dnsmasq\_no\_dns\_rebind": "1",

&#x20;   "wk\_mode": "gateway",

&#x20;   "wl0\_gmode\_protection": "auto",

&#x20;   "filter\_tod5": "",

&#x20;   "wl0\_wds8": "",

&#x20;   "rc\_shutdown": "",

&#x20;   "wl0.2\_akm": "disabled",

&#x20;   "wl0.1\_wpa\_gtk\_rekey": "3600",

&#x20;   "filter\_tod6": "",

&#x20;   "ali\_iot\_type0": "TELNET",

&#x20;   "vrrp\_id": "100",

&#x20;   "ntrip\_serv\_ip": "",

&#x20;   "enable\_m2m": "0",

&#x20;   "AD7828G": "AD7028H",

&#x20;   "wl0\_wds9": "",

&#x20;   "qos\_done\_": "0",

&#x20;   "NC\_GatewayMode": "Open",

&#x20;   "wl0\_wds6\_netmask": "",

&#x20;   "filter\_tod7": "",

&#x20;   "ali\_iot\_type1": "HTTP",

&#x20;   "wl0\_radmacpassword": "0",

&#x20;   "filter\_tod8": "",

&#x20;   "ipsec\_detectinval": "60",

&#x20;   "m1s2wanapn\_cst": "internet",

&#x20;   "openvpn\_bridge": "0",

&#x20;   "wl0\_wds9\_desc": "",

&#x20;   "filter\_tod9": "",

&#x20;   "static\_wan\_gateway": "192.168.20.1",

&#x20;   "bulk\_ceil\_up": "1",

&#x20;   "run\_timeout": "10",

&#x20;   "ospf\_nettype": "0",

&#x20;   "bgp\_updatesource": "0",

&#x20;   "lan\_wins": "",

&#x20;   "vlan0hwname": "et0",

&#x20;   "dhcp\_dnsmasq": "1",

&#x20;   "NC\_IdleTimeout": "0",

&#x20;   "ip\_conntrack\_udp\_timeouts": "120",

&#x20;   "dhcpd\_options": "",

&#x20;   "w1\_kponm": "7",

&#x20;   "ospf\_vtytrdelay": "1",

&#x20;   "lan\_hwnames": "",

&#x20;   "AD7828L": "AD7028L",

&#x20;   "AR7088-FSTD": "S9922L",

&#x20;   "enc\_sertm1": "200",

&#x20;   "dtu\_flowctrl1": "1",

&#x20;   "gps\_netport": "",

&#x20;   "dhcpd\_usejffs": "0",

&#x20;   "static\_leases": "",

&#x20;   "wds\_watchdog\_enable": "0",

&#x20;   "express\_ceil\_up": "15",

&#x20;   "cloud\_enable": "1",

&#x20;   "reboot\_tm\_day": "0",

&#x20;   "m2\_chapms\_allowed": "1",

&#x20;   "pppoe\_demand": "0",

&#x20;   "bgp\_nexthopself": "0",

&#x20;   "AD7828N": "AD7028N",

&#x20;   "RemoteDomain": "",

&#x20;   "local\_dns": "0",

&#x20;   "wl0.3\_auth": "0",

&#x20;   "wl0\_wds10\_desc": "",

&#x20;   "wl0\_radius\_key": "",

&#x20;   "m2\_pap\_allowed": "1",

&#x20;   "filter\_dport\_grp10": "",

&#x20;   "wl0\_wme\_ap\_be": "15 63 3 0 0 off",

&#x20;   "wl0\_wds10\_netmask": "",

&#x20;   "wl0\_nmcsidx": "-1",

&#x20;   "m1s2wandial": "0",

&#x20;   "wl0\_lazy\_wds": "",

&#x20;   "openvpncl\_certtype": "0",

&#x20;   "encup\_netmode": "1",

&#x20;   "dtu\_addlen\_101": "2",

&#x20;   "mqtt\_serport": "",

&#x20;   "refresh\_time": "5",

&#x20;   "openvpn\_keep\_wait": "120",

&#x20;   "boot\_hours": "0",

&#x20;   "wshaper\_downlink\_": "0",

&#x20;   "wl0\_wds3\_if": "",

&#x20;   "wl0\_channel": "0",

&#x20;   "wl0\_wds5\_enable": "0",

&#x20;   "pptp\_encrypt": "0",

&#x20;   "m2s2wanapn": "3gnet",

&#x20;   "cert\_memory": "15",

&#x20;   "openvpn\_failreboot": "30",

&#x20;   "NC\_ForcedRedirect": "0",

&#x20;   "ddns\_wan\_ip": "1",

&#x20;   "m2s2wandial": "card",

&#x20;   "m1simfail": "90",

&#x20;   "ali\_iot\_retry\_count": "20",

&#x20;   "gps\_netip": "",

&#x20;   "wl0\_wme\_ap\_bk": "15 1023 7 0 0 off",

&#x20;   "dtu\_cli\_redialtm": "3",

&#x20;   "schedule\_hour\_time": "1",

&#x20;   "wl0\_wds7\_desc": "",

&#x20;   "wl0\_wds10\_enable": "0",

&#x20;   "dr\_setting": "0",

&#x20;   "m1\_ppp3g\_assigngw": "0",

&#x20;   "smsctrl\_aply": "1",

&#x20;   "AD7828W": "AD7028W",

&#x20;   "openvpn\_ca": "",

&#x20;   "openvpn\_startip": "0.0.0.0",

&#x20;   "hs\_redirect": "",

&#x20;   "http\_redirect\_destination": "0.0.0.0",

&#x20;   "eth5\_ipaddr": "0.0.0.0",

&#x20;   "urlfilter\_ips\_temp": "",

&#x20;   "dhcpc\_vendorclass": "",

&#x20;   "wol\_hostname": "",

&#x20;   "wl0\_wds4\_hwaddr": "",

&#x20;   "pptpd\_lip": "",

&#x20;   "openvpn\_endip": "0.0.0.0",

&#x20;   "dtu\_databit1": "1",

&#x20;   "filter\_rule10": "",

&#x20;   "bgp\_neighborip": "192.168.1.254",

&#x20;   "m1s1wanapn": "internet",

&#x20;   "eth2\_bridged": "1",

&#x20;   "forwardspec\_entries": "0",

&#x20;   "rflow\_if": "br0",

&#x20;   "wshaper\_enable\_": "0",

&#x20;   "wl0.1\_auth": "0",

&#x20;   "dtu\_srv\_txqtm": "0",

&#x20;   "NC\_AllowedWebHosts": "",

&#x20;   "def\_whwaddr": "00:00:00:00:00:00",

&#x20;   "wl0\_auth\_mode": "disabled",

&#x20;   "w1\_kponfailsw": "2",

&#x20;   "dhcpc\_requestip": "",

&#x20;   "status\_auth": "1",

&#x20;   "wl0.3\_closed": "0",

&#x20;   "gretap\_conns": "",

&#x20;   "autofw\_port0": "",

&#x20;   "ospf\_intname": "0",

&#x20;   "gps\_priproto": "2",

&#x20;   "warn\_enabled": "0",

&#x20;   "language": "english",

&#x20;   "wl0\_crypto": "tkip+aes",

&#x20;   "AR7088-ESTD": "S9922L",

&#x20;   "dtu\_mtu1": "1024",

&#x20;   "cloud\_log\_tm": "10",

&#x20;   "def\_hwaddr": "00:00:00:00:00:00",

&#x20;   "bgp\_enable": "0",

&#x20;   "boot\_week\_e": "0",

&#x20;   "port4vlan": "1",

&#x20;   "m2\_ipv4v6": "0",

&#x20;   "gps\_idadd": "1",

&#x20;   "mqtt\_combaud": "10",

&#x20;   "openvpn\_net": "0.0.0.0",

&#x20;   "pro\_gwlk\_en": "0",

&#x20;   "wl0\_wds9\_ospf": "",

&#x20;   "wl0\_wds5\_desc": "",

&#x20;   "wl0\_wds3\_ipaddr": "",

&#x20;   "macupd\_enable": "0",

&#x20;   "wl0.2\_bridged": "1",

&#x20;   "static\_wan\_netmask": "255.255.255.0",

&#x20;   "rip\_preventloop": "0",

&#x20;   "eth6\_bridged": "1",

&#x20;   "mmc\_enable0": "0",

&#x20;   "cloud\_logenable": "0",

&#x20;   "ospf\_area": "0",

&#x20;   "rflow\_ip": "0.0.0.0",

&#x20;   "standard\_ceil\_dn": "10",

&#x20;   "limit\_l2tp": "0",

&#x20;   "limit\_telnet": "0",

&#x20;   "wl0.2\_radius\_ipaddr": "",

&#x20;   "wan\_cid": "3",

&#x20;   "filter\_dport\_grp1": "",

&#x20;   "w2\_kponretry": "4",

&#x20;   "bgp\_neighboras": "7674",

&#x20;   "pptpd\_client\_mru": "1450",

&#x20;   "wl0\_wds9\_ipaddr": "",

&#x20;   "rc\_custom": "",

&#x20;   "filter\_dport\_grp2": "",

&#x20;   "w1\_kponivl": "60",

&#x20;   "rip\_updatetimer": "30",

&#x20;   "vrrp\_priority": "10",

&#x20;   "vrrp\_linkwan": "0"

&#x20; },

&#x20; "nvram\_anahtar\_sayisi": 1560,

&#x20; "sim1": {

&#x20;   "iccid": "8990011626160064930F",

&#x20;   "imsi": "286016661026495",

&#x20;   "imei": "867191084820421",

&#x20;   "aktif\_sim\_yuvasi": "SIM1",

&#x20;   "sim\_durumu": "OK",

&#x20;   "sebeke\_tipi": "FDD LTE",

&#x20;   "band": "LTE-FDD B7",

&#x20;   "modul\_adi": "Q200AF",

&#x20;   "sinyal\_dbm": "65",

&#x20;   "hucre\_id": "70D02C",

&#x20;   "sinyal\_gurultu": "19",

&#x20;   "wan\_ip": "31.140.144.25",

&#x20;   "wan\_ag\_gecidi": "31.140.144.230",

&#x20;   "wan\_dns": "213.74.0.4 213.74.1.4",

&#x20;   "bagli\_sure": "0:50:00",

&#x20;   "wan\_protokol": "m13gdhcp",

&#x20;   "iccid\_temiz": "8990011626160064930",

&#x20;   "operator": "Turkcell"

&#x20; },

&#x20; "sim2": {

&#x20;   "aktif\_sim\_yuvasi": "SIM2",

&#x20;   "sim\_durumu": "Invalid",

&#x20;   "bagli\_sure": "Not available",

&#x20;   "wan\_protokol": "dhcp"

&#x20; },

&#x20; "sistem": {

&#x20;   "lan\_ip": "192.168.1.1",

&#x20;   "lan\_mac": "00:0C:43:43:5F:4E",

&#x20;   "lan\_mac\_uretici": "Ralink/MediaTek",

&#x20;   "wan\_mac1": "02:0C:29:A3:9B:6D",

&#x20;   "wifi\_durum": "Radio is Off",

&#x20;   "wifi\_kanal": "Unknown",

&#x20;   "uptime": "10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09",

&#x20;   "bellek": ",'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000",

&#x20;   "lan\_proto": "dhcp"

&#x20; },

&#x20; "ok": true

}



Ricon modem — 192.168.1.1  (2026-08-26T07:55:51.329Z)



&#x20; Sistem:

&#x20;   lan\_ip          : 192.168.1.1

&#x20;   lan\_mac         : 00:0C:43:43:5F:4E

&#x20;   lan\_mac\_uretici : Ralink/MediaTek

&#x20;   wan\_mac1        : 02:0C:29:A3:9B:6D

&#x20;   wifi\_durum      : Radio is Off

&#x20;   wifi\_kanal      : Unknown

&#x20;   uptime          : 10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09

&#x20;   bellek          : ,'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000

&#x20;   lan\_proto       : dhcp



&#x20; SIM1:

&#x20;   iccid           : 8990011626160064930F

&#x20;   imsi            : 286016661026495

&#x20;   imei            : 867191084820421

&#x20;   aktif\_sim\_yuvasi: SIM1

&#x20;   sim\_durumu      : OK

&#x20;   sebeke\_tipi     : FDD LTE

&#x20;   band            : LTE-FDD B7

&#x20;   modul\_adi       : Q200AF

&#x20;   sinyal\_dbm      : 65

&#x20;   hucre\_id        : 70D02C

&#x20;   sinyal\_gurultu  : 19

&#x20;   wan\_ip          : 31.140.144.25

&#x20;   wan\_ag\_gecidi   : 31.140.144.230

&#x20;   wan\_dns         : 213.74.0.4 213.74.1.4

&#x20;   bagli\_sure      : 0:50:00

&#x20;   wan\_protokol    : m13gdhcp

&#x20;   iccid\_temiz     : 8990011626160064930

&#x20;   operator        : Turkcell



&#x20; SIM2:

&#x20;   aktif\_sim\_yuvasi: SIM2

&#x20;   sim\_durumu      : Invalid

&#x20;   bagli\_sure      : Not available

&#x20;   wan\_protokol    : dhcp



&#x20; nvram: 1560 anahtar cekildi



JSON yazildi: data/deneme.json

PS C:\\Projeler\\ricon\_modem> node --env-file=.env ricon.js kesif

\[kesif] port taramasi...

\[kesif] HTTP parmak izi...

\[kesif] SNMP...

{

&#x20; "zaman": "2026-08-26T07:56:07.013Z",

&#x20; "komut": "kesif",

&#x20; "modem\_ip": "192.168.1.1",

&#x20; "problems": \[],

&#x20; "kapilar": \[

&#x20;   {

&#x20;     "kapi": 22,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "SSH"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 23,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "telnet"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 53,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "DNS"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 80,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "HTTP (web arayuzu)"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 443,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "HTTPS"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 502,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "Modbus TCP"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 1723,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "PPTP VPN"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 5000,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "HTTP (alternatif)"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 8080,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "HTTP (alternatif)"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 8443,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "HTTPS (alternatif)"

&#x20;   },

&#x20;   {

&#x20;     "kapi": 9999,

&#x20;     "acik": false,

&#x20;     "banner": null,

&#x20;     "ad": "DTU / ham TCP"

&#x20;   }

&#x20; ],

&#x20; "arp": {

&#x20;   "192.168.1.1": "00:0c:43:43:5f:4e",

&#x20;   "192.168.1.255": "ff:ff:ff:ff:ff:ff"

&#x20; },

&#x20; "mac": "00:0c:43:43:5f:4e",

&#x20; "mac\_uretici": "Ralink/MediaTek",

&#x20; "http": {

&#x20;   "kod": 200,

&#x20;   "baslik": "Industrial Cellular Router",

&#x20;   "ddwrt\_izi": true

&#x20; },

&#x20; "snmp": {

&#x20;   "cevapVerdi": false,

&#x20;   "degerler": {},

&#x20;   "community": "public"

&#x20; },

&#x20; "ok": true

}



Ricon modem — 192.168.1.1  (2026-08-26T07:56:07.013Z)



&#x20; Acik kapilar:

PS C:\\Projeler\\ricon\_modem> node --test

✔ ciftleriAyikla: sistem canli ucundaki alanlari cikarir (2.0463ms)

✔ ciftleriAyikla: HTML tasiyan alanlardaki etiketleri temizler (0.5668ms)

✔ ciftleriAyikla: \_\_proto\_\_ alani prototipi kirletmez (0.1775ms)

✔ iccidTemizle: sondaki F dolgusu atilir (0.2465ms)

✔ operatorTahmin: IMSI onekinden operator (0.1918ms)

✔ simGorunumu: ham alanlar okunabilir gorunume eslenir (0.6351ms)

✔ nvramAyikla: tam yedegi anahtar/deger olarak cozer (6.0418ms)

✔ nvramAyikla: bozuk basluk NVRAM\_BAD\_HEADER verir, throw etmez (0.2921ms)

✔ nvramFark: degisen/eklenen/silinen ayrimi (1.1135ms)

✔ istemci: salt-okunur modda POST reddedilir (1.8117ms)

✔ istemci: 401'i kimlik durumuna gore siniflar (40.1548ms)

✔ istemci: kimlikli 401 AUTH\_REJECTED verir (5.6276ms)

✔ istemci: istekler SIRALI ve arali calisir (tek-baglanti kisiti) (335.6326ms)

✔ istemci: bos govde EMPTY\_BODY uyarisi (error degil) (6.2758ms)

✔ ag: arp ciktisi ayristirilir (0.9738ms)

✔ ag: ipv6 komsu ciktisi ayristirilir (0.6394ms)

✔ ag: OUI'den uretici tahmini (0.3369ms)

✔ sorunlar: her kod tarif edilebilir (0.5246ms)

✔ sorunlar: bilinmeyen kod patlamaz (0.526ms)

✔ sorunlar: warning ok'u bozmaz, error bozar (0.3002ms)

✔ rapor: sirlar ciktidan temizlenir (0.4565ms)

ℹ tests 21

ℹ suites 0

ℹ pass 21

ℹ fail 0

ℹ cancelled 0

ℹ skipped 0

ℹ todo 0

ℹ duration\_ms 594.8994

PS C:\\Projeler\\ricon\_modem> node ricon.js oku --kaynak data/deneme.json

{

&#x20; "zaman": "2026-08-26T07:55:51.329Z",

&#x20; "komut": "oku",

&#x20; "modem\_ip": "192.168.1.1",

&#x20; "kimlik\_hazir": true,

&#x20; "uclar": {

&#x20;   "info": {

&#x20;     "yol": "/asp/status/Info.htm",

&#x20;     "kod": 200,

&#x20;     "boyut": 17715,

&#x20;     "tur": "sistem",

&#x20;     "ham\_html\_boyut": 17715

&#x20;   },

&#x20;   "info\_live": {

&#x20;     "yol": "/asp/status/Info.live.htm",

&#x20;     "kod": 200,

&#x20;     "boyut": 598,

&#x20;     "tur": "sistem"

&#x20;   },

&#x20;   "internet\_live": {

&#x20;     "yol": "/asp/status/Status\_Internet.live.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 3276,

&#x20;     "tur": "kimlik"

&#x20;   },

&#x20;   "wireless\_live": {

&#x20;     "yol": "/asp/status/Status\_Wireless.live.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 244,

&#x20;     "tur": "kimlik"

&#x20;   },

&#x20;   "setup\_index": {

&#x20;     "yol": "/asp/setup/index.asp",

&#x20;     "kod": 200,

&#x20;     "boyut": 25672,

&#x20;     "tur": "kimlik",

&#x20;     "ham\_html\_boyut": 25672

&#x20;   },

&#x20;   "nvram\_yedek": {

&#x20;     "yol": "/nvrambak.bin",

&#x20;     "kod": 200,

&#x20;     "boyut": 28724,

&#x20;     "tur": "config"

&#x20;   }

&#x20; },

&#x20; "ham\_alanlar": {

&#x20;   "uptime": "Wed, 26 Aug 2026 10:55:52",

&#x20;   "uptime\_spe": "10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09",

&#x20;   "lan\_mac": "00:0C:43:43:5F:4E",

&#x20;   "wan\_mac1": "02:0C:29:A3:9B:6D",

&#x20;   "wan\_mac2": "",

&#x20;   "wl\_mac": "",

&#x20;   "lan\_ip": "192.168.1.1",

&#x20;   "wl\_channel": "Unknown",

&#x20;   "wl\_radio": "Radio is Off",

&#x20;   "wl\_mode\_short": "ap",

&#x20;   "lan\_proto": "dhcp",

&#x20;   "active\_wireless": "",

&#x20;   "active\_wds": "",

&#x20;   "mem\_info": ",'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000",

&#x20;   "cpu\_temp": "",

&#x20;   "ip\_conntrack": "10",

&#x20;   "pptpcl\_leases": "",

&#x20;   "l2tpcl\_leases": "",

&#x20;   "wan\_ttraffs": "",

&#x20;   "w1ipinfo": "31.140.144.25",

&#x20;   "w2ipinfo": "",

&#x20;   "wan\_uptime": "0:49:51",

&#x20;   "w1\_wan\_shortproto": "m13gdhcp",

&#x20;   "w2\_wan\_shortproto": "dhcp",

&#x20;   "m13gname": "Q200AF",

&#x20;   "m1imei": "867191084820421",

&#x20;   "m1sim": "SIM1",

&#x20;   "m1simst": "OK",

&#x20;   "m1simimsi": "286016661026495",

&#x20;   "m1simiccid": "8990011626160064930F",

&#x20;   "m1signal": "",

&#x20;   "m1dbm": "65",

&#x20;   "m1network": "FDD LTE",

&#x20;   "m1bandinfo": "LTE-FDD B7",

&#x20;   "m1cellid": "70D02C",

&#x20;   "m1noiseratio": "19",

&#x20;   "m23gname": "",

&#x20;   "m2imei": "",

&#x20;   "m2sim": "SIM2",

&#x20;   "m2simst": "Invalid",

&#x20;   "m2simimsi": "",

&#x20;   "m2simiccid": "",

&#x20;   "m2signal": "",

&#x20;   "m2dbm": "",

&#x20;   "m2network": "",

&#x20;   "m2bandinfo": "",

&#x20;   "m2cellid": "",

&#x20;   "m2noiseratio": "",

&#x20;   "w1\_wanup": "0:50:00",

&#x20;   "w1\_wan\_ip": "31.140.144.25",

&#x20;   "w1\_wan\_nm": "255.0.0.0",

&#x20;   "w1\_wan\_gw": "31.140.144.230",

&#x20;   "w1\_wan\_dns": "213.74.0.4 213.74.1.4",

&#x20;   "w1\_dhcp\_remaining": "0 days 23:09:59",

&#x20;   "w2\_wanup": "Not available",

&#x20;   "w2\_wan\_ip": "",

&#x20;   "w2\_wan\_nm": "",

&#x20;   "w2\_wan\_gw": "",

&#x20;   "w2\_wan\_dns": "",

&#x20;   "w2\_dhcp\_remaining": "0 days 00:00:00",

&#x20;   "wl\_ssid": "Ricon-WiFi",

&#x20;   "wl\_xmit": "",

&#x20;   "wl\_rate": "Disabled",

&#x20;   "wl\_ack": "",

&#x20;   "packet\_info": "SWRXgoodPacket=0;SWRXerrorPacket=0;SWTXgoodPacket=0;SWTXerrorPacket=0;"

&#x20; },

&#x20; "problems": \[],

&#x20; "nvram": {

&#x20;   "wl\_mac\_deny": "",

&#x20;   "wl\_txstreams": "0",

&#x20;   "wl\_maxassoc": "128",

&#x20;   "wl\_phytypes": "",

&#x20;   "wl\_distance": "2000",

&#x20;   "wl\_infra": "1",

&#x20;   "wl\_wme\_apsd": "on",

&#x20;   "wl\_mrate": "0",

&#x20;   "wl\_active\_add\_mac": "0",

&#x20;   "wl\_wme\_sta\_vi": "7 15 2 6016 3008 off",

&#x20;   "wl\_wme\_ap\_be": "15 63 3 0 0 off",

&#x20;   "wl\_wme\_sta\_vo": "3 7 2 3264 1504 off",

&#x20;   "wl\_plcphdr": "long",

&#x20;   "wl\_macmode": "disabled",

&#x20;   "wl\_wme\_ap\_bk": "15 1023 7 0 0 off",

&#x20;   "wl\_phytype": "g",

&#x20;   "wl\_lazywds": "0",

&#x20;   "wl\_dfs\_postism": "60",

&#x20;   "wl\_mode": "ap",

&#x20;   "wl\_wme\_txp\_vi": "7 3 4 2 0",

&#x20;   "wl\_wme\_txp\_vo": "7 3 4 2 0",

&#x20;   "wl\_dtim": "1",

&#x20;   "wl\_ssid": "Ricon-WiFi",

&#x20;   "wl\_shortslot": "auto",

&#x20;   "wl\_passphrase": "",

&#x20;   "wl\_hwaddr": "",

&#x20;   "wl\_active\_mac": "",

&#x20;   "wl\_net\_mode": "mixed",

&#x20;   "wl\_rxstreams": "0",

&#x20;   "wl\_rate": "0",

&#x20;   "wl\_macmode1": "disabled",

&#x20;   "wl\_rateset": "default",

&#x20;   "wl\_crypto": "off",

&#x20;   "wl\_wep\_bit": "64",

&#x20;   "wl\_unit": "0",

&#x20;   "wl\_nmode\_protection": "auto",

&#x20;   "wl\_wds": "",

&#x20;   "wl\_wme": "on",

&#x20;   "wl\_radauth": "0",

&#x20;   "wl\_wme\_ap\_vi": "7 15 1 6016 3008 off",

&#x20;   "wl\_auth": "0",

&#x20;   "wl\_wep\_last": "",

&#x20;   "wl\_wme\_ap\_vo": "3 7 1 3264 1504 off",

&#x20;   "wl\_frameburst": "off",

&#x20;   "wl\_ifname": "",

&#x20;   "wl\_wep": "disabled",

&#x20;   "wl\_gmode\_protection": "auto",

&#x20;   "wl\_frag": "2346",

&#x20;   "wl\_wep\_gen": "",

&#x20;   "wl\_wme\_sta\_be": "15 1023 3 0 0 off",

&#x20;   "wl\_radioids": "",

&#x20;   "wl\_corerev": "",

&#x20;   "wl\_wme\_sta\_bk": "15 1023 7 0 0 off",

&#x20;   "wl\_afterburner": "off",

&#x20;   "wl\_radio": "1",

&#x20;   "wl\_rts": "2347",

&#x20;   "wl\_ap\_isolate": "0",

&#x20;   "wl\_mac\_list": "",

&#x20;   "wl\_wme\_no\_ack": "off",

&#x20;   "wl\_wme\_txp\_be": "7 3 4 2 0",

&#x20;   "wl\_dfs\_preism": "60",

&#x20;   "wl\_wme\_txp\_bk": "7 3 4 2 0",

&#x20;   "wl\_bcn": "100",

&#x20;   "wl\_wep\_buf": "",

&#x20;   "wl\_reg\_mode": "off",

&#x20;   "pro\_showpkt\_en": "0",

&#x20;   "wl0\_wds2\_if": "",

&#x20;   "wl0.1\_radius\_port": "1812",

&#x20;   "filter\_dport\_grp3": "",

&#x20;   "ses\_script": "",

&#x20;   "mqtt\_dn": "",

&#x20;   "http\_redirect\_port": "3128",

&#x20;   "wl0\_wds10\_ospf": "",

&#x20;   "l2tp\_client\_rebootivl": "30",

&#x20;   "filter\_dport\_grp4": "",

&#x20;   "ntrip\_lat": "",

&#x20;   "reboot\_tm\_h": "3",

&#x20;   "filter": "off",

&#x20;   "filter\_dport\_grp5": "",

&#x20;   "NC\_Verbosity": "2",

&#x20;   "wds0.1": "",

&#x20;   "l2tp\_passwd": "",

&#x20;   "wl0\_net\_mode": "disabled",

&#x20;   "filter\_dport\_grp6": "",

&#x20;   "ospf\_intadvanced": "0",

&#x20;   "sv\_localdns": "0.0.0.0",

&#x20;   "netauth\_preauthtm": "2",

&#x20;   "openvpn\_lzo": "0",

&#x20;   "openvpncl\_ip": "",

&#x20;   "enc\_shpkt": "0",

&#x20;   "dtu\_servmode": "5",

&#x20;   "wds0.2": "",

&#x20;   "filter\_dport\_grp7": "",

&#x20;   "AD7028-DS": "S9922S",

&#x20;   "openvpncl\_client": "",

&#x20;   "dtu\_lkaddr\_101": "1",

&#x20;   "dtu\_stopbit": "1",

&#x20;   "wds0.3": "",

&#x20;   "l2tp\_client\_keepfail": "5",

&#x20;   "l2tpclt\_mppe40b": "1",

&#x20;   "wl0\_frameburst": "off",

&#x20;   "filter\_dport\_grp8": "",

&#x20;   "mqtt\_ds": "",

&#x20;   "python\_enable": "0",

&#x20;   "pptpclt\_chapms\_v2": "1",

&#x20;   "wds\_watchdog\_interval\_sec": "1000",

&#x20;   "wds0.4": "",

&#x20;   "filter\_dport\_grp9": "",

&#x20;   "w2\_recon": "0",

&#x20;   "loopback\_netmask": "255.0.0.0",

&#x20;   "AR7888": "AR7088H",

&#x20;   "enc\_up\_flowctrl": "1",

&#x20;   "zebra\_log": "0",

&#x20;   "wds0.5": "",

&#x20;   "reboot\_tm\_m": "00",

&#x20;   "ddns\_username\_2": "",

&#x20;   "ipsec\_compatmode": "1",

&#x20;   "log\_ipaddr": "0",

&#x20;   "AR7800": "AR7000",

&#x20;   "NC\_RenewTimeout": "0",

&#x20;   "wds0.6": "",

&#x20;   "wl0\_wds7\_ospf": "",

&#x20;   "wl0\_wds3\_desc": "",

&#x20;   "ddns\_username\_3": "",

&#x20;   "ntp\_interval": "3600",

&#x20;   "exempt\_ceil\_dn": "100",

&#x20;   "wds0.7": "",

&#x20;   "ddns\_username\_4": "",

&#x20;   "ppp\_idletime": "5",

&#x20;   "openvpncl\_enable": "0",

&#x20;   "NC\_SplashURL": "",

&#x20;   "zebra\_copt": "0",

&#x20;   "wds0.8": "",

&#x20;   "ddns\_username\_5": "",

&#x20;   "w2\_lnkp": "1",

&#x20;   "netauth\_username": "admin",

&#x20;   "eth2\_netmask": "0.0.0.0",

&#x20;   "port2vlan": "1",

&#x20;   "wds0.9": "",

&#x20;   "syslog\_pri\_ur": "6",

&#x20;   "ddns\_username\_6": "",

&#x20;   "w1\_kponcount": "5",

&#x20;   "quagga\_debug\_enable": "0",

&#x20;   "openvpn\_dupcn": "0",

&#x20;   "enc\_iecpublen\_101": "2",

&#x20;   "standard\_ceil\_up": "10",

&#x20;   "ddns\_username\_7": "",

&#x20;   "et0macaddr": "00:0C:43:43:5F:4E",

&#x20;   "python\_memory": "16",

&#x20;   "dtu\_cli\_redialtotaltm": "0",

&#x20;   "snmpd\_rocommunity": "public",

&#x20;   "ddns\_username\_8": "",

&#x20;   "ddns\_enable": "0",

&#x20;   "wl0.3\_key": "1",

&#x20;   "wl0\_leddc": "0x640000",

&#x20;   "mqtt\_serip": "",

&#x20;   "AR7088-DSTD": "S9922L",

&#x20;   "openvpn\_mtu": "1500",

&#x20;   "NC\_MaxMissedARP": "5",

&#x20;   "wl0\_ipaddr": "0.0.0.0",

&#x20;   "NC\_MACWhiteList": "",

&#x20;   "enc\_iecpublen\_104": "2",

&#x20;   "l2tp\_rip": "",

&#x20;   "skip\_intel\_check": "0",

&#x20;   "ddns\_conf": "",

&#x20;   "wl0.2\_radius\_port": "1812",

&#x20;   "wl0\_shortslot": "auto",

&#x20;   "ipsec\_debug": "0",

&#x20;   "wl0\_akm": "psk psk2",

&#x20;   "mqtt\_pub": "",

&#x20;   "openvpncl\_key": "",

&#x20;   "dtu\_proto\_filter": "0",

&#x20;   "syslogd\_rem\_ip": "",

&#x20;   "ppp\_restartppp": "1",

&#x20;   "boot\_wait": "on",

&#x20;   "nas\_enable": "1",

&#x20;   "filter\_web\_host1": "",

&#x20;   "bgp\_autosummary": "0",

&#x20;   "ntrip\_ggamodel": "2",

&#x20;   "mqtt\_ser\_auth": "0",

&#x20;   "m1s2ppppwd": "card",

&#x20;   "wl0.2\_netmask": "0.0.0.0",

&#x20;   "filter\_web\_host2": "",

&#x20;   "gps\_keygsa": "1",

&#x20;   "ipsec\_remode": "0",

&#x20;   "eth6\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_tun\_netmask": "",

&#x20;   "premium\_ceil\_dn": "75",

&#x20;   "filter\_web\_host3": "",

&#x20;   "m2s1band": "0",

&#x20;   "fw\_disable": "0",

&#x20;   "pptpd\_client\_srvsub": "",

&#x20;   "openvpn\_dh": "",

&#x20;   "wl0\_wds1\_if": "",

&#x20;   "wl0\_wds5\_ospf": "",

&#x20;   "wl0\_wds1\_desc": "",

&#x20;   "router\_name": "Industrial Cellular Router",

&#x20;   "filter\_web\_host4": "",

&#x20;   "m1\_ims": "0",

&#x20;   "wshaper\_enable": "0",

&#x20;   "l2tpclt\_chap": "1",

&#x20;   "filter\_web\_host5": "",

&#x20;   "eth0\_ipaddr": "0.0.0.0",

&#x20;   "pptpclt\_mppe40b": "1",

&#x20;   "dtu\_short\_link\_mode": "0",

&#x20;   "dtu\_clientmode": "",

&#x20;   "dtu\_flowctrl": "1",

&#x20;   "wl0\_wds6\_enable": "0",

&#x20;   "ddns\_wildcard": "",

&#x20;   "def\_lhwaddr": "00:00:00:00:00:00",

&#x20;   "https\_enable": "0",

&#x20;   "filter\_web\_host6": "",

&#x20;   "pam\_unlocktm": "0",

&#x20;   "exempt\_ceil\_up": "100",

&#x20;   "apwatchdog\_enable": "0",

&#x20;   "wl0.2\_wpa\_psk": "",

&#x20;   "m2\_chapms\_v2\_allowed": "1",

&#x20;   "filter\_web\_host7": "",

&#x20;   "m2m\_net\_proto": "1",

&#x20;   "af\_publish": "1",

&#x20;   "openvpncl\_config": "",

&#x20;   "openvpncl\_authmode": "0",

&#x20;   "svqos\_port2bw": "FULL",

&#x20;   "wl0\_wds3\_netmask": "",

&#x20;   "telnet\_wanport": "5123",

&#x20;   "l2tp\_get\_ip": "",

&#x20;   "l2tp\_client\_srvmtu": "1450",

&#x20;   "filter\_web\_host8": "",

&#x20;   "ses\_event": "2",

&#x20;   "m2simfail": "90",

&#x20;   "ospf\_vtyarea": "2",

&#x20;   "AR7000-DP": "S1000-MEB",

&#x20;   "dhcpfwd\_ip": "0.0.0.0",

&#x20;   "encup\_link": "server.alotcer.com,28035;,;,;,;,;",

&#x20;   "filter\_web\_host9": "",

&#x20;   "radio1\_on\_time": "111111111111111111111111",

&#x20;   "wshaper\_uplink\_": "0",

&#x20;   "pptpd\_forcemppe": "1",

&#x20;   "pptp\_server\_ip": "",

&#x20;   "ppp\_get\_ac": "",

&#x20;   "ali\_iot\_port0": "23",

&#x20;   "mqtt\_service\_id": "",

&#x20;   "eth6\_ipaddr": "0.0.0.0",

&#x20;   "pptpd\_lcp\_failure": "3",

&#x20;   "port0vlan": "0",

&#x20;   "pptpd\_bcrelay": "0",

&#x20;   "restore\_defaults": "0",

&#x20;   "ali\_iot\_port1": "80",

&#x20;   "lan\_ipaddr\_ex1": "192.168.8.1",

&#x20;   "AR7000-DS": "S9922XL",

&#x20;   "pptp\_use\_dhcp": "0",

&#x20;   "pro\_repeat\_en": "0",

&#x20;   "wl0\_wds5\_hwaddr": "",

&#x20;   "remote\_ip1": "0.0.0.0 0",

&#x20;   "lan\_ipaddr\_ex2": "0.0.0.0",

&#x20;   "wl0.3\_radius\_key": "",

&#x20;   "wl0.3\_radius\_port": "1812",

&#x20;   "wl0.1\_key": "1",

&#x20;   "remote\_ip2": "0.0.0.0 0",

&#x20;   "lan\_ipaddr\_ex3": "0.0.0.0",

&#x20;   "pptpd\_client\_srvip": "",

&#x20;   "wl0\_wds10\_hwaddr": "",

&#x20;   "l2tpclt\_auth": "1",

&#x20;   "remote\_ip3": "0.0.0.0 0",

&#x20;   "ospf\_priority": "1",

&#x20;   "af\_dnathost": "0",

&#x20;   "m1s1conmode": "0",

&#x20;   "wl0\_wme\_sta\_be": "15 1023 3 0 0 off",

&#x20;   "wl0\_nctrlsb": "lower",

&#x20;   "remote\_ip4": "0.0.0.0 0",

&#x20;   "filter\_port": "",

&#x20;   "remote\_ip5": "0.0.0.0 0",

&#x20;   "eth10\_bridged": "1",

&#x20;   "wl0.3\_auth\_mode": "disabled",

&#x20;   "gps\_comdatabit": "1",

&#x20;   "mqtt\_ser\_psk": "",

&#x20;   "remote\_ip6": "0.0.0.0 0",

&#x20;   "pptpclt\_chapms": "1",

&#x20;   "ip\_conntrack\_tcp\_timeouts": "3600",

&#x20;   "wl0\_wds3\_ospf": "",

&#x20;   "wl0\_wds7\_netmask": "",

&#x20;   "ddns\_hostname": "",

&#x20;   "wl0.2\_ssid": "",

&#x20;   "http\_wanport": "8088",

&#x20;   "filter\_ip\_grp1": "",

&#x20;   "ospf\_linktrdelay": "1",

&#x20;   "remote\_ip7": "0.0.0.0 0",

&#x20;   "openvpn\_redirgate": "0",

&#x20;   "encdw\_sernum": "0",

&#x20;   "premium\_ceil\_up": "75",

&#x20;   "filter\_ip\_grp2": "",

&#x20;   "m2s1conmode": "0",

&#x20;   "gps\_keyoth": "1",

&#x20;   "lan\_gateway": "0.0.0.0",

&#x20;   "remote\_ip8": "0.0.0.0 0",

&#x20;   "AD7028-ES": "S9922S",

&#x20;   "w2\_kpon\_lan\_switch": "2",

&#x20;   "dtu\_srv\_tmot1": "2700",

&#x20;   "dtu\_cli\_bindlan": "1",

&#x20;   "l2tp\_client\_enable": "0",

&#x20;   "filter\_ip\_grp3": "",

&#x20;   "wl0\_ifname": "ra0",

&#x20;   "remote\_ip9": "0.0.0.0 0",

&#x20;   "snmp\_trap\_manager\_ip": "192.168.1.254",

&#x20;   "openvpncl\_tun\_serip": "10.8.0.1",

&#x20;   "shutdown\_day\_e": "0",

&#x20;   "dr\_lan\_rx": "0",

&#x20;   "filter\_ip\_grp4": "",

&#x20;   "ntrip\_long": "",

&#x20;   "lan\_domain": "",

&#x20;   "af\_city": "",

&#x20;   "openvpn\_debug": "0",

&#x20;   "wl0\_wme\_sta\_bk": "15 1023 7 0 0 off",

&#x20;   "dtu\_publen\_101": "2",

&#x20;   "snmpd\_rwcommunity": "private",

&#x20;   "wl0\_wds4\_ipaddr": "",

&#x20;   "filter\_ip\_grp5": "",

&#x20;   "ospf\_vtyadvanced": "0",

&#x20;   "hs\_html": "",

&#x20;   "filter\_ip\_grp6": "",

&#x20;   "log\_accepted": "0",

&#x20;   "pptpd\_client\_ipparam": "",

&#x20;   "pptpd\_client\_srvsec": "",

&#x20;   "dtu\_downlink\_mode": "0",

&#x20;   "dtu\_cli\_redialivl": "10",

&#x20;   "pppoe\_ac": "",

&#x20;   "filter\_ip\_grp7": "",

&#x20;   "filter\_rule1": "",

&#x20;   "vrrp\_virip1": "0.0.0.0",

&#x20;   "gps\_keygsv": "1",

&#x20;   "smsctrl\_rule": "sms1,1,ANY,0,connect;sms2,1,ANY,1,disconnect;sms3,1,ANY,2,reboot;sms4,1,ANY,3,;",

&#x20;   "pptpd\_lcp\_interval": "15",

&#x20;   "dtu\_publen\_104": "2",

&#x20;   "cloud\_syslogenable": "0",

&#x20;   "hb\_server\_ip": "",

&#x20;   "ipsec\_pass": "1",

&#x20;   "filter\_ip\_grp8": "",

&#x20;   "filter\_rule2": "",

&#x20;   "ses\_button": "0",

&#x20;   "ospf\_nssatrans": "0",

&#x20;   "vrrp\_virip2": "0.0.0.0",

&#x20;   "openvpncl\_remoteip": "0.0.0.0",

&#x20;   "wl0\_wds0\_if": "",

&#x20;   "pptpd\_radserver": "0.0.0.0",

&#x20;   "rflow\_enable": "0",

&#x20;   "filter\_ip\_grp9": "",

&#x20;   "filter\_rule3": "",

&#x20;   "ses\_enable": "1",

&#x20;   "vrrp\_virip3": "0.0.0.0",

&#x20;   "expert\_mode": "1",

&#x20;   "schedule\_minutes": "0",

&#x20;   "wl0.2\_key1": "",

&#x20;   "filter\_rule4": "",

&#x20;   "openvpncl\_cipher": "bf-cbc",

&#x20;   "wl0.2\_key2": "",

&#x20;   "filter\_rule5": "",

&#x20;   "w1\_kpontimeout": "3",

&#x20;   "ospf\_vtyhello": "10",

&#x20;   "AD7028-A": "S9922S",

&#x20;   "openvpncl\_tlscip": "0",

&#x20;   "wl0\_mrate": "0",

&#x20;   "wl0.2\_key3": "",

&#x20;   "filter\_ip\_grp10": "",

&#x20;   "filter\_rule6": "",

&#x20;   "dtu\_servport1": "6002",

&#x20;   "wol\_passwd": "",

&#x20;   "wl0.2\_key4": "",

&#x20;   "wl0\_mode": "ap",

&#x20;   "filter\_rule7": "",

&#x20;   "dtu\_parity": "1",

&#x20;   "wl0\_wds1\_ospf": "",

&#x20;   "pptpd\_radpass": "",

&#x20;   "dhcp\_start": "100",

&#x20;   "filter\_rule8": "",

&#x20;   "ali\_iot\_enable": "0",

&#x20;   "AD7028-D": "S9922S",

&#x20;   "filter\_rule9": "",

&#x20;   "AD7028-E": "S9922S",

&#x20;   "pptpd\_enable": "0",

&#x20;   "wl0\_ap\_isolate": "0",

&#x20;   "vrrp\_times": "10",

&#x20;   "AD7028-F": "S9922S",

&#x20;   "openvpn\_client": "",

&#x20;   "svqos\_port4prio": "10",

&#x20;   "filter\_services\_1": "",

&#x20;   "dist\_type": "",

&#x20;   "snmp\_trap\_interval": "300",

&#x20;   "NC\_DocumentRoot": "/www",

&#x20;   "boot\_day": "0",

&#x20;   "wshaper\_nopriohostsrc": "",

&#x20;   "l2tp\_server\_ip": "",

&#x20;   "l2tp\_server\_enable": "0",

&#x20;   "ddns\_force": "10",

&#x20;   "m1\_chapms\_allowed": "1",

&#x20;   "wl0\_wme\_no\_ack": "off",

&#x20;   "enc\_timenable": "0",

&#x20;   "wl0\_gmode": "1",

&#x20;   "dhcp\_lease": "1440",

&#x20;   "af\_zip": "",

&#x20;   "openvpncl\_debug": "0",

&#x20;   "encdw\_checkdiscon": "1",

&#x20;   "m2s1wanapn": "3gnet",

&#x20;   "mqtt\_comparity": "1",

&#x20;   "eth3\_bridged": "1",

&#x20;   "openvpn\_keep\_invl": "10",

&#x20;   "openvpn\_proto": "udp",

&#x20;   "wds\_watchdog\_ips": "",

&#x20;   "remote\_ip\_any": "1",

&#x20;   "ntrip\_mountpoint": "",

&#x20;   "AR7000-FSP": "S1000-MEB",

&#x20;   "pptpd\_client\_assign": "0",

&#x20;   "openvpn\_enable": "0",

&#x20;   "ddns\_period": "60",

&#x20;   "limit\_ssh": "0",

&#x20;   "wl0.2\_wpa\_gtk\_rekey": "3600",

&#x20;   "mqtt\_ser\_port": "1883",

&#x20;   "pptpd\_client\_assignip": "0.0.0.0",

&#x20;   "urlfilter\_enable": "0",

&#x20;   "dnsmasq\_enable": "1",

&#x20;   "w1\_lnkpnivl": "5",

&#x20;   "ping\_ip": "",

&#x20;   "AR7000-EP": "S1000-MEB",

&#x20;   "eth10\_netmask": "0.0.0.0",

&#x20;   "dtu\_cli\_redialwait": "60",

&#x20;   "dtu\_ser1en": "0",

&#x20;   "wl0\_nband": "2",

&#x20;   "m1\_wan\_netmask": "",

&#x20;   "ntrip\_netip": "",

&#x20;   "mqtt\_ser\_clientid": "",

&#x20;   "wan\_nat": "1",

&#x20;   "af\_agree": "0",

&#x20;   "encup\_mode": "1",

&#x20;   "w2\_wan\_proto": "dhcp",

&#x20;   "stats\_server": "",

&#x20;   "static\_route": "",

&#x20;   "w2\_lnkpnivl": "5",

&#x20;   "w2\_kpontimeout": "3",

&#x20;   "AR7000-ES": "S9922XL",

&#x20;   "openvpncl\_ca": "",

&#x20;   "sip\_port": "5060",

&#x20;   "NC\_extifname": "auto",

&#x20;   "cloud\_servport": "7001",

&#x20;   "telnet\_lanport": "5123",

&#x20;   "wl0\_nreqd": "0",

&#x20;   "ospf\_linkauthmd5key": "2",

&#x20;   "pptpd\_client\_mtu": "1450",

&#x20;   "openvpncl\_tlsauth": "",

&#x20;   "radvd\_conf": "",

&#x20;   "wl0\_security\_mode": "psk psk2",

&#x20;   "wl0.1\_crypto": "off",

&#x20;   "wl0.3\_bridged": "1",

&#x20;   "pam\_tacplus\_en": "0",

&#x20;   "ntrip\_recon": "15",

&#x20;   "lan\_netmask": "255.255.255.0",

&#x20;   "eth7\_bridged": "1",

&#x20;   "wl0\_wme\_txp\_be": "7 3 4 2 0",

&#x20;   "wl0\_wds1\_enable": "0",

&#x20;   "dmz\_enable": "0",

&#x20;   "http\_source\_network": "0.0.0.0",

&#x20;   "wifi\_display": "wl0",

&#x20;   "wl0\_dtim": "1",

&#x20;   "wl0\_ssid": "Ricon-WiFi",

&#x20;   "http\_username": "$1$JWLkvRy2$0ZqGZNx7nR/pyhBq6DhMa1",

&#x20;   "ali\_iot\_serip": "backend-iotx-remote-debug.aliyun.com",

&#x20;   "ospf\_spfhold": "5000",

&#x20;   "enc\_up\_databit": "1",

&#x20;   "port\_trigger": "",

&#x20;   "ospf\_areatype": "0",

&#x20;   "openvpn\_debug\_level": "4",

&#x20;   "filter\_web\_host10": "",

&#x20;   "w1\_dns": "0.0.0.0",

&#x20;   "ospf\_vtyip": "1.1.1.1",

&#x20;   "mqtt\_authmode": "0",

&#x20;   "http\_redirect\_enable": "0",

&#x20;   "openvpn\_adv": "0",

&#x20;   "shutdown\_hours": "0",

&#x20;   "l2tp\_client\_assignip": "0.0.0.0",

&#x20;   "wl0\_dfs\_preism": "60",

&#x20;   "w2\_kponivl": "60",

&#x20;   "mqtt\_ser\_othercfg": "",

&#x20;   "ipsec\_failreboot": "30",

&#x20;   "AD7028-FS": "S9922S",

&#x20;   "AD7028-W": "S9922S",

&#x20;   "w2\_kpon\_lan\_dst": "192.168.254.1",

&#x20;   "eth1\_ipaddr": "0.0.0.0",

&#x20;   "openvpncl\_statickey": "",

&#x20;   "enc\_checkradom": "1",

&#x20;   "svqos\_port2prio": "10",

&#x20;   "wl0\_wds7\_enable": "0",

&#x20;   "cron\_enable": "1",

&#x20;   "wl0\_wme\_txp\_bk": "7 3 4 2 0",

&#x20;   "http\_lanport": "80",

&#x20;   "openvpncl\_proto": "udp",

&#x20;   "encdw\_link": "",

&#x20;   "port4tag": "0",

&#x20;   "filter\_mac\_grp1": "",

&#x20;   "openvpn\_detectlink": "1",

&#x20;   "openvpn\_config": "",

&#x20;   "openvpn\_tun\_clip": "10.8.0.1",

&#x20;   "ppp\_service": "",

&#x20;   "filter\_mac\_grp2": "",

&#x20;   "gps\_keygll": "1",

&#x20;   "mqtt\_pwdmode": "1",

&#x20;   "eth7\_ipaddr": "0.0.0.0",

&#x20;   "filter\_mac\_grp3": "",

&#x20;   "wan\_domain": "",

&#x20;   "wan\_hwname": "",

&#x20;   "mqtt\_serial\_num": "0",

&#x20;   "urlfilter\_ips\_amount\_temp": "",

&#x20;   "radiooff\_button": "0",

&#x20;   "wl0\_wds6\_hwaddr": "",

&#x20;   "wl0\_key1": "",

&#x20;   "wl0\_web\_filter": "0",

&#x20;   "filter\_mac\_grp4": "",

&#x20;   "m2\_wan\_netmask": "",

&#x20;   "ali\_iot\_product\_securt": "5e3nbgN3uytPrbrE",

&#x20;   "mqtt\_sub": "",

&#x20;   "lan\_lease": "86400",

&#x20;   "wl0\_key2": "",

&#x20;   "wl0\_vlan\_prio\_mode": "off",

&#x20;   "pppoe\_static\_ip": "",

&#x20;   "filter\_mac\_grp5": "",

&#x20;   "gps\_comflowctrl": "1",

&#x20;   "w2\_kpon\_lan\_ivl": "60",

&#x20;   "openvpncl\_tun\_netip": "",

&#x20;   "wl0\_txant": "3",

&#x20;   "ddns\_wildcard\_6": "",

&#x20;   "wl0\_key3": "",

&#x20;   "filter\_mac\_grp6": "",

&#x20;   "m1\_tempture": "75",

&#x20;   "ospf\_vtyareaauth": "0",

&#x20;   "m1s2conmode": "0",

&#x20;   "pptpd\_client\_srvsubmsk": "",

&#x20;   "enc\_iecifolen\_101": "2",

&#x20;   "ddns\_wildcard\_7": "",

&#x20;   "wl0\_key4": "",

&#x20;   "filter\_mac\_grp7": "",

&#x20;   "pppoe\_compression": "0",

&#x20;   "vrrp\_virip": "192.168.10.1",

&#x20;   "netauth\_ifname": "LAN",

&#x20;   "boot\_minutes": "0",

&#x20;   "wshaper\_nopriohostdst": "",

&#x20;   "l2tp\_forcemppe": "1",

&#x20;   "ddns\_url": "",

&#x20;   "wl0\_bridged": "1",

&#x20;   "filter\_mac\_grp8": "",

&#x20;   "filter\_client0": "",

&#x20;   "ali\_iot\_label\_val": "device",

&#x20;   "mqtt\_ser\_sysival": "10",

&#x20;   "AR7088-ASTD": "S9922L",

&#x20;   "eth3\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_lzo": "0",

&#x20;   "filter\_mac\_grp9": "",

&#x20;   "filter\_maclist": "",

&#x20;   "m2\_tempture": "75",

&#x20;   "gps\_rate": "5",

&#x20;   "AR7828": "AD7028V",

&#x20;   "m1s1pppuser": "card",

&#x20;   "enc\_iecifolen\_104": "3",

&#x20;   "wl0\_vifs": "",

&#x20;   "pptp\_pass": "1",

&#x20;   "ppp\_demand": "0",

&#x20;   "w1\_kponsec": "",

&#x20;   "m2s2conmode": "0",

&#x20;   "l2tpclt\_mppereq": "0",

&#x20;   "mtu\_enable": "0",

&#x20;   "w1\_recon": "0",

&#x20;   "ospf\_spfstart": "0",

&#x20;   "gps\_keyvtg": "1",

&#x20;   "AD7028-WS": "S9922S",

&#x20;   "enc\_checktime": "0",

&#x20;   "wl0\_br1\_nat": "0",

&#x20;   "mqtt\_pwd": "",

&#x20;   "encup\_listen": "28035",

&#x20;   "block\_activex": "0",

&#x20;   "m2s1pppuser": "card",

&#x20;   "gps\_comstopbit": "1",

&#x20;   "wl0\_wds5\_ipaddr": "",

&#x20;   "l2tp\_hostname": "Router",

&#x20;   "w1\_kpontrthold": "0",

&#x20;   "mqtt\_pub\_type": "0",

&#x20;   "wl0\_br1\_enable": "0",

&#x20;   "sshd\_forwarding": "0",

&#x20;   "remote\_mgt\_https": "0",

&#x20;   "wl0.1\_ipaddr": "0.0.0.0",

&#x20;   "http\_passwd": "$1$iWDB2Pre$IBKVvGPFapP2nCnxQW6Sh1",

&#x20;   "openvpn\_bind\_lan": "1",

&#x20;   "wl0\_wds10\_ipaddr": "",

&#x20;   "block\_wan": "0",

&#x20;   "ospf\_linkdead": "40",

&#x20;   "gps\_updspeed": "0",

&#x20;   "pptpclt\_mppestateless": "1",

&#x20;   "openvpncl\_remoteport": "1194",

&#x20;   "l2tp\_client\_keepivl": "60",

&#x20;   "wl0.3\_netmask": "0.0.0.0",

&#x20;   "mqtt\_mode": "0",

&#x20;   "lan\_stp": "0",

&#x20;   "eth7\_netmask": "0.0.0.0",

&#x20;   "wl0\_wme\_ap\_vi": "7 15 1 6016 3008 off",

&#x20;   "wl0.3\_radius\_ipaddr": "",

&#x20;   "wl0.3\_akm": "disabled",

&#x20;   "m2s2ppppwd": "card",

&#x20;   "enc\_remote\_adjust": "0",

&#x20;   "openvpncl\_mtu": "1500",

&#x20;   "skip\_amd\_check": "0",

&#x20;   "wl0.1\_radius\_key": "",

&#x20;   "pppoe\_assigngw": "0",

&#x20;   "ospf\_areaauth": "0",

&#x20;   "router\_style": "blue",

&#x20;   "encup\_sernum": "1",

&#x20;   "dtu\_showpkt": "0",

&#x20;   "openvpn\_cipher": "bf-cbc",

&#x20;   "forward\_spec": "",

&#x20;   "w2\_kponfailsw": "1",

&#x20;   "af\_dnatport": "0",

&#x20;   "openvpn\_tlscip": "0",

&#x20;   "port3tag": "0",

&#x20;   "vlanports": "1,0,1,1,1,1,,,,,;",

&#x20;   "l2tp\_server\_name": "",

&#x20;   "wl0.3\_wpa\_psk": "",

&#x20;   "wl0\_plcphdr": "long",

&#x20;   "wl0\_rate": "0",

&#x20;   "wl0\_closed": "0",

&#x20;   "AR7000-FS": "S9922M44-DOA",

&#x20;   "schedule\_enable": "0",

&#x20;   "wl0\_wds4\_netmask": "",

&#x20;   "wl0\_macmode": "disabled",

&#x20;   "vrrp\_enable": "0",

&#x20;   "pptpd\_client\_srvmru": "1450",

&#x20;   "wl0\_wme\_ap\_vo": "3 7 1 3264 1504 off",

&#x20;   "svqos\_port1bw": "FULL",

&#x20;   "pptpd\_radius": "0",

&#x20;   "ospf\_localid": "192.168.1.1",

&#x20;   "pam\_tacplus\_secret1": "router",

&#x20;   "mqtt\_ser\_dupmsg": "1",

&#x20;   "lan\_nat": "0",

&#x20;   "m1s1ppppwd": "card",

&#x20;   "m1s1band": "0",

&#x20;   "netauth\_authedtm": "2",

&#x20;   "dtu\_conn\_mode": "1",

&#x20;   "bulk\_rate\_dn": "1",

&#x20;   "block\_snmp": "1",

&#x20;   "wl0\_phytype": "g",

&#x20;   "m1simmain": "1",

&#x20;   "pam\_tacplus\_secret2": "",

&#x20;   "svqos\_macs\_amount\_temp": "",

&#x20;   "NC\_RouteOnly": "0",

&#x20;   "dr\_wan\_rx": "0",

&#x20;   "wl0\_lazywds": "0",

&#x20;   "filter\_tod\_buf1": "",

&#x20;   "ospf\_cost": "1",

&#x20;   "urlfilter\_amount\_temp": "",

&#x20;   "openvpncl\_mssfix": "",

&#x20;   "wds1.10": "",

&#x20;   "reboot\_tm": "60",

&#x20;   "block\_proxy": "0",

&#x20;   "filter\_tod\_buf2": "",

&#x20;   "lan\_cclass": "192.168.1.",

&#x20;   "NC\_GatewayPort": "5280",

&#x20;   "rflow\_port": "2055",

&#x20;   "snmpd\_syslocation": "Unknown",

&#x20;   "express\_rate\_dn": "15",

&#x20;   "wds1.11": "",

&#x20;   "filter\_tod\_buf3": "",

&#x20;   "w1\_connfailbt": "0",

&#x20;   "m1simswtch": "1",

&#x20;   "ntriplist\_flasht": "3600",

&#x20;   "pptpclt\_mppereq": "0",

&#x20;   "openvpncl\_keep\_wait": "120",

&#x20;   "qos\_type": "0",

&#x20;   "wds1.12": "",

&#x20;   "pptpd\_rip": "",

&#x20;   "filter\_tod\_buf4": "",

&#x20;   "w2\_kpontrthold": "0",

&#x20;   "ospf\_vtyretrmit": "5",

&#x20;   "traffic\_mac\_entries\_temp": "",

&#x20;   "wds1.13": "",

&#x20;   "filter\_tod\_buf5": "",

&#x20;   "ali\_iot\_serport": "443",

&#x20;   "netauth\_passwd": "123456",

&#x20;   "openvpn\_crl": "",

&#x20;   "dtu\_conn\_allon": "0",

&#x20;   "wds1.14": "",

&#x20;   "log\_filter": "mck",

&#x20;   "syslog\_detail": "0",

&#x20;   "dr\_lan\_tx": "0",

&#x20;   "wl0\_afterburner": "off",

&#x20;   "wl0\_netmask": "0.0.0.0",

&#x20;   "filter\_tod\_buf6": "",

&#x20;   "af\_serviceid": "0",

&#x20;   "openvpncl\_tuntap": "tun",

&#x20;   "NC\_SplashURLTimeout": "21600",

&#x20;   "wol\_macs": "",

&#x20;   "wds1.15": "",

&#x20;   "wl0\_wds8\_netmask": "",

&#x20;   "apwatchdog\_interval": "15",

&#x20;   "wl0\_antdiv": "3",

&#x20;   "filter\_tod\_buf7": "",

&#x20;   "filter\_tod10": "",

&#x20;   "AR7000-WP": "S1000-MEB",

&#x20;   "radio1\_timer\_enable": "0",

&#x20;   "encdw\_mode": "3",

&#x20;   "dtu\_ifolen\_101": "2",

&#x20;   "wds1.16": "",

&#x20;   "tcp\_retries2": "15",

&#x20;   "wl0.1\_auth\_mode": "disabled",

&#x20;   "filter\_tod\_buf8": "",

&#x20;   "wan\_dns": "",

&#x20;   "pppoe\_mlppp": "0",

&#x20;   "w1\_kpon\_lan\_mode": "1",

&#x20;   "filter\_tod\_buf9": "",

&#x20;   "mullinkfail": "30",

&#x20;   "enc\_up\_baudrate": "10",

&#x20;   "dtu\_proto\_parse": "1",

&#x20;   "wl0.1\_akm": "disabled",

&#x20;   "AR7000-WS": "S9922XL",

&#x20;   "dtu\_ifolen\_104": "3",

&#x20;   "dtu\_compat\_mode": "0",

&#x20;   "ip\_conntrack\_max": "4096",

&#x20;   "ipv6\_enable0": "0",

&#x20;   "wl0\_wds8\_desc": "",

&#x20;   "dial\_demand": "1",

&#x20;   "forward\_entries": "0",

&#x20;   "dhcpd\_usenvram": "0",

&#x20;   "wl0\_wpa\_psk": "1234567890",

&#x20;   "wl0.2\_crypto": "off",

&#x20;   "w2\_kponcount": "5",

&#x20;   "log\_dropped": "0",

&#x20;   "schedule\_bs\_enable": "0",

&#x20;   "wl0\_wds2\_enable": "0",

&#x20;   "ali\_iot\_retry\_invalms": "100",

&#x20;   "bgp\_localid": "192.168.1.1",

&#x20;   "wait\_time": "5",

&#x20;   "openvpn\_crt": "",

&#x20;   "openvpncl\_auth": "sha1",

&#x20;   "cloud\_servip": "78.186.62.169",

&#x20;   "pptpd\_radport": "1812",

&#x20;   "ali\_iot\_rekpivl": "80",

&#x20;   "vrrp\_interface": "1",

&#x20;   "gps\_check\_link\_mode": "1",

&#x20;   "pptpclt\_chap": "1",

&#x20;   "openvpn\_detectimes": "2",

&#x20;   "bulk\_rate\_up": "1",

&#x20;   "m2m\_srvip": "58.215.16.142",

&#x20;   "dns\_dnsmasq": "1",

&#x20;   "dtu\_short\_link\_tmot": "180",

&#x20;   "macupd\_ip": "0.0.0.0",

&#x20;   "wl0.2\_auth": "0",

&#x20;   "mqtt\_clean": "1",

&#x20;   "daylight\_time": "1",

&#x20;   "ipsecport\_bind": "0",

&#x20;   "l2tpclt\_bind": "0",

&#x20;   "af\_address\_2": "",

&#x20;   "eth2\_ipaddr": "0.0.0.0",

&#x20;   "dtu\_mode": "0",

&#x20;   "packetfilter\_policy": "DROP",

&#x20;   "wl0\_wds9\_if": "",

&#x20;   "security\_mode": "disabled",

&#x20;   "dhcp\_wins": "wan",

&#x20;   "eth0\_bridged": "1",

&#x20;   "upgrade\_delay": "1200",

&#x20;   "port2tag": "0",

&#x20;   "express\_rate\_up": "15",

&#x20;   "wl0\_wds1\_hwaddr": "",

&#x20;   "wl0\_wds8\_enable": "0",

&#x20;   "filter\_tod\_buf10": "",

&#x20;   "os\_server": "",

&#x20;   "AR7000-A": "S9922XL",

&#x20;   "fon\_usernames": "0",

&#x20;   "enc\_up\_stopbit": "1",

&#x20;   "pppoe\_static": "0",

&#x20;   "w1\_connfailsw": "10",

&#x20;   "mqtt\_pk": "",

&#x20;   "w1\_kpon\_lan\_dst": "",

&#x20;   "shutdown\_week\_e": "0",

&#x20;   "remote\_mgt\_ssh": "1",

&#x20;   "hb\_server\_domain": "",

&#x20;   "port\_swap": "0",

&#x20;   "enc\_conn\_rtnmain": "0",

&#x20;   "dtu\_inval1": "100",

&#x20;   "AR7000-D": "S9922XL",

&#x20;   "eth8\_ipaddr": "0.0.0.0",

&#x20;   "mmc\_enable": "0",

&#x20;   "ospfd\_conf": "",

&#x20;   "wl0\_unit": "0",

&#x20;   "w1\_kponfst": "8.8.8.8",

&#x20;   "ntrip\_serv\_port": "",

&#x20;   "mqtt\_ser\_maxinfmsg": "20",

&#x20;   "AR7000-E": "S9922XL",

&#x20;   "web\_proto\_simple": "1",

&#x20;   "shutdown\_week": "0",

&#x20;   "macfilter\_enable": "0",

&#x20;   "wshaper\_noprioportsrc": "",

&#x20;   "wds0.10": "",

&#x20;   "wl0\_wds7\_hwaddr": "",

&#x20;   "ospf\_linkhello": "10",

&#x20;   "AR7000-F": "S9922XL",

&#x20;   "NC\_IncludePorts": "",

&#x20;   "dtu\_baudrate1": "10",

&#x20;   "ar\_restore\_defaults": "0",

&#x20;   "wds0.11": "",

&#x20;   "wl0\_wds6\_desc": "",

&#x20;   "wl0\_txpwr": "71",

&#x20;   "ntrip\_serv\_mountpoint": "",

&#x20;   "pptpd\_client\_srvpass": "",

&#x20;   "enable\_jffs2": "0",

&#x20;   "wds0.12": "",

&#x20;   "dtu\_baudrate": "10",

&#x20;   "wds0.13": "",

&#x20;   "static\_route\_name": "",

&#x20;   "w1\_kpon\_lan\_ivl": "60",

&#x20;   "snmp\_trap\_port": "162",

&#x20;   "eth4\_bridged": "1",

&#x20;   "wds0.14": "",

&#x20;   "openvpn\_cl2cl": "1",

&#x20;   "packetfilter\_enable": "0",

&#x20;   "wds0.15": "",

&#x20;   "wl0\_nmode": "-1",

&#x20;   "m1s2pppuser": "card",

&#x20;   "AR7000-ESP": "S1000-MEB",

&#x20;   "enc\_conn\_mode": "0",

&#x20;   "wds0.16": "",

&#x20;   "ntp\_enable": "1",

&#x20;   "gre\_conns": "",

&#x20;   "enable\_game": "0",

&#x20;   "dtu\_mtu": "1024",

&#x20;   "language\_list": "english,",

&#x20;   "ospf\_vtyauthpwd": "123456",

&#x20;   "l2tpclt\_mppe56b": "1",

&#x20;   "remote\_ip": "0.0.0.0 0",

&#x20;   "mqtt\_ser\_inval": "20",

&#x20;   "wl0\_wds6\_ipaddr": "",

&#x20;   "ddns\_custom\_5": "",

&#x20;   "forward\_port": "",

&#x20;   "m2s2pppuser": "card",

&#x20;   "ospf\_vtyauthmd5key": "1",

&#x20;   "ipsec\_lonat": "0",

&#x20;   "NC\_HomePage": "",

&#x20;   "smtp\_redirect\_enable": "0",

&#x20;   "sys\_enable\_jffs2": "0",

&#x20;   "cloud\_heart\_tm": "8",

&#x20;   "l2tp\_client\_keepip": "",

&#x20;   "gps\_keyrmc": "1",

&#x20;   "mqtt\_ser\_debug": "information",

&#x20;   "m2m\_devnum": "00EE0000000100000007",

&#x20;   "m2m\_srvport": "15695",

&#x20;   "wshaper\_dev": "WAN",

&#x20;   "wl0.2\_ipaddr": "0.0.0.0",

&#x20;   "openvpn\_nat": "0",

&#x20;   "schedule\_mode": "1",

&#x20;   "limit\_pptp": "0",

&#x20;   "ntrip\_account": "",

&#x20;   "AR7088H-FS": "S99MC2X-LTE",

&#x20;   "AR7088-WSTD": "S9922L",

&#x20;   "eth8\_bridged": "1",

&#x20;   "ali\_iot\_dakpivl": "60",

&#x20;   "ali\_iot\_product\_key": "a1WJKqg0uI4",

&#x20;   "pam\_tacplus\_localauth": "0",

&#x20;   "boot\_week": "0",

&#x20;   "snmpd\_sysname": "Router",

&#x20;   "wl0\_wds8\_ospf": "",

&#x20;   "wl0\_wds4\_desc": "",

&#x20;   "wl0\_wds": "",

&#x20;   "filter\_mac\_grp10": "",

&#x20;   "m2\_ppp3g\_assign": "0",

&#x20;   "bgp\_localas": "7676",

&#x20;   "ntrip\_csmodel": "1",

&#x20;   "snmp\_trap\_enable": "0",

&#x20;   "pptp\_server\_name": "",

&#x20;   "port3vlan": "1",

&#x20;   "wl0\_wds8\_if": "",

&#x20;   "ddns\_dyndnstype\_6": "",

&#x20;   "ppp\_static\_ip": "",

&#x20;   "static\_wan\_dns": "",

&#x20;   "ospf\_network": "192.168.1.0/24",

&#x20;   "mqtt\_keepalive": "60",

&#x20;   "m1s1wanapn\_cst": "internet",

&#x20;   "openvpncl\_tun\_clip": "10.8.0.2",

&#x20;   "port1tag": "0",

&#x20;   "telnetd\_enable": "1",

&#x20;   "block\_java": "0",

&#x20;   "log\_level": "0",

&#x20;   "AR7000-ASP": "S1000-MEB",

&#x20;   "dtu\_servport": "6001",

&#x20;   "hs\_urls": "",

&#x20;   "wl0\_reg\_mode": "off",

&#x20;   "m2\_chap\_allowed": "1",

&#x20;   "ntp\_server": "0.tr.pool.ntp.org",

&#x20;   "ct\_modules": "",

&#x20;   "AR7000-W": "S9922XL",

&#x20;   "base\_station\_time": "-1",

&#x20;   "upgrade\_delay\_sec": "10",

&#x20;   "openvpn\_ccddef": "",

&#x20;   "standard\_rate\_dn": "10",

&#x20;   "ApCliKeyType": "0",

&#x20;   "eth0\_netmask": "0.0.0.0",

&#x20;   "NC\_GatewayName": "ARxxx",

&#x20;   "m1\_bstiming": "0",

&#x20;   "mqtt\_comdatabit": "1",

&#x20;   "eth10\_ipaddr": "0.0.0.0",

&#x20;   "remote\_mgt\_telnet": "1",

&#x20;   "sshd\_dss\_host\_key": "",

&#x20;   "l2tp\_client\_srvsubmsk": "",

&#x20;   "m2simmain": "1",

&#x20;   "lan\_netmask\_ex1": "255.255.255.0",

&#x20;   "openvpn\_wait\_on": "300",

&#x20;   "wl0\_wme": "on",

&#x20;   "dtu\_conn\_rtnmain": "0",

&#x20;   "snmpd\_enable": "0",

&#x20;   "cloud\_iface": "0",

&#x20;   "flow\_write\_fixhour": "23",

&#x20;   "wl0\_radius\_port": "1812",

&#x20;   "wl0\_auth": "0",

&#x20;   "m2\_bstiming": "0",

&#x20;   "ipsec\_tmout": "300",

&#x20;   "lan\_netmask\_ex2": "0.0.0.0",

&#x20;   "custpro": "Router",

&#x20;   "openvpncl\_adv": "0",

&#x20;   "smtp\_source\_network": "0.0.0.0",

&#x20;   "lan\_netmask\_ex3": "0.0.0.0",

&#x20;   "af\_email": "",

&#x20;   "openvpn\_mssfix": "",

&#x20;   "openvpncl\_debug\_level": "4",

&#x20;   "sshd\_port": "22",

&#x20;   "wl0\_radius\_ipaddr": "",

&#x20;   "m2s2band": "0",

&#x20;   "wshaper\_noprioportdst": "",

&#x20;   "cron\_jobs": "",

&#x20;   "pppoe\_service": "",

&#x20;   "m2\_ims": "0",

&#x20;   "gps\_netproto": "1",

&#x20;   "pptpclt\_mppe56b": "1",

&#x20;   "wl0\_wme\_sta\_vi": "7 15 2 6016 3008 off",

&#x20;   "svqos\_macs": "",

&#x20;   "openvpn\_gateway": "0.0.0.0",

&#x20;   "wl0\_wds6\_ospf": "",

&#x20;   "wl0\_wds2\_desc": "",

&#x20;   "bgp\_syn": "0",

&#x20;   "gps\_updivl": "60",

&#x20;   "loopback\_ipaddr": "127.0.0.1",

&#x20;   "sysver": "8171",

&#x20;   "eth4\_netmask": "0.0.0.0",

&#x20;   "wl0.3\_wpa\_gtk\_rekey": "3600",

&#x20;   "af\_enable": "0",

&#x20;   "openvpn\_tuntap": "tun",

&#x20;   "schedule\_weekdays": "00",

&#x20;   "w2\_kponsec": "",

&#x20;   "w1\_lnkp": "1",

&#x20;   "m1detfail": "360",

&#x20;   "exempt\_rate\_dn": "100",

&#x20;   "remote\_management": "1",

&#x20;   "KeyType": "0",

&#x20;   "wan\_ifnames": "vlan0",

&#x20;   "radio0\_timer\_enable": "0",

&#x20;   "wl0\_wme\_sta\_vo": "3 7 2 3264 1504 off",

&#x20;   "NC\_ExcludePorts": "25",

&#x20;   "schedule\_time": "3600",

&#x20;   "port1vlan": "1",

&#x20;   "hs\_enable": "",

&#x20;   "svqos\_port4bw": "FULL",

&#x20;   "block\_loopback": "0",

&#x20;   "pptpd\_client\_reconivl": "10",

&#x20;   "pro\_gwlk": "{gw:\[{pro:,lk:\[{pro:,dev:\[{dname:,daddr:,reg:\[]}],rtu:{rtu\_pro:\[],rtu\_chl:\[],rtu\_ctl:\[],rtu\_algo:\[],rtu\_rain:\[],rtu\_modb:\[],rtu\_modbc:\[],rtu\_adc:\[],rtu\_sdi:\[],rtu\_ftu:\[],rtu\_mcup:\[],rtu\_mcuf:\[],rtu\_gnss:\[]}}],net:\[]}],reg:\[],ser:\[]}",

&#x20;   "dtu\_short\_link\_activate": "0",

&#x20;   "standard\_rate\_up": "10",

&#x20;   "wl0\_wds1\_netmask": "",

&#x20;   "l2tp\_client\_srvsub": "",

&#x20;   "wl0.3\_crypto": "off",

&#x20;   "gps\_comparity": "1",

&#x20;   "wl0\_wds3\_enable": "0",

&#x20;   "wl0.2\_key": "1",

&#x20;   "ospf\_enable": "0",

&#x20;   "wifi\_bonding": "0",

&#x20;   "svqos\_svcs": "",

&#x20;   "http\_method": "post",

&#x20;   "eth8\_netmask": "0.0.0.0",

&#x20;   "enc\_iecrsnlen\_101": "2",

&#x20;   "hs\_exempt": "",

&#x20;   "wl0\_wds7\_if": "",

&#x20;   "http\_chkivl": "120",

&#x20;   "port0tag": "0",

&#x20;   "filter\_port\_grp1": "",

&#x20;   "gps\_combaud": "10",

&#x20;   "mqtt\_ser\_maxquemsg": "100",

&#x20;   "lan\_ipaddr": "192.168.1.1",

&#x20;   "lan\_proto": "dhcp",

&#x20;   "eth3\_ipaddr": "0.0.0.0",

&#x20;   "pptpd\_client\_srvmtu": "1450",

&#x20;   "wl0\_maxassoc": "128",

&#x20;   "wl0\_wds9\_enable": "0",

&#x20;   "filter\_port\_grp2": "",

&#x20;   "rip\_garbagetimer": "120",

&#x20;   "wanlink\_nat": "3",

&#x20;   "ipsec\_detectlink": "1",

&#x20;   "vlan1hwname": "et0",

&#x20;   "portprio\_support": "0",

&#x20;   "enc\_iecrsnlen\_104": "2",

&#x20;   "wl0\_wds2\_hwaddr": "",

&#x20;   "ddns\_passwd\_2": "",

&#x20;   "filter\_port\_grp10": "",

&#x20;   "filter\_port\_grp3": "",

&#x20;   "w2\_kponm": "1",

&#x20;   "filter\_id": "1",

&#x20;   "openvpn\_auth": "sha1",

&#x20;   "trigger\_entries": "0",

&#x20;   "clean\_jffs2": "0",

&#x20;   "wl0\_wds4\_ospf": "",

&#x20;   "reboot\_inter": "1",

&#x20;   "ddns\_passwd\_3": "",

&#x20;   "dr\_wan\_tx": "0",

&#x20;   "wl0.3\_ssid": "",

&#x20;   "filter\_port\_grp4": "",

&#x20;   "mqtt\_comflowctrl": "1",

&#x20;   "urlfilter\_entries\_temp": "",

&#x20;   "wol\_enable": "0",

&#x20;   "ddns\_passwd\_4": "",

&#x20;   "wl0\_max\_unauth\_users": "0",

&#x20;   "wl0\_phytypes": "",

&#x20;   "filter\_port\_grp5": "",

&#x20;   "eth9\_ipaddr": "0.0.0.0",

&#x20;   "enc\_up\_parity": "1",

&#x20;   "premium\_rate\_dn": "75",

&#x20;   "wl0\_wds5\_netmask": "",

&#x20;   "ddns\_passwd\_5": "",

&#x20;   "wl0\_frag": "2346",

&#x20;   "filter\_port\_grp6": "",

&#x20;   "maskmac": "1",

&#x20;   "syslogd\_enable": "3",

&#x20;   "l2tp\_client\_reconivl": "10",

&#x20;   "ddns\_passwd\_6": "",

&#x20;   "ddns\_username": "",

&#x20;   "wl0.1\_closed": "0",

&#x20;   "filter\_port\_grp7": "",

&#x20;   "m2s1ppppwd": "card",

&#x20;   "ospf\_vtyenable": "0",

&#x20;   "ipsec\_wait\_on": "300",

&#x20;   "wl0\_wds8\_hwaddr": "",

&#x20;   "l2tp\_client\_nat": "1",

&#x20;   "l2tp\_lip": "",

&#x20;   "ddns\_passwd\_7": "",

&#x20;   "ddns\_passwd": "",

&#x20;   "filter\_port\_grp8": "",

&#x20;   "m2\_ppp3g\_assigngw": "0",

&#x20;   "ospf\_linkretrmit": "5",

&#x20;   "openvpn\_tmout": "300",

&#x20;   "pro\_cache\_en": "0",

&#x20;   "l2tpclt\_mppe128b": "1",

&#x20;   "ddns\_passwd\_8": "",

&#x20;   "block\_ident": "1",

&#x20;   "wl0\_distance": "2000",

&#x20;   "wl0\_nbw": "20",

&#x20;   "filter\_port\_grp9": "",

&#x20;   "w1\_kponretry": "4",

&#x20;   "pppoe\_assign": "0",

&#x20;   "gps\_keygga": "1",

&#x20;   "m2m\_heartint": "30",

&#x20;   "gre\_nat\_en": "0",

&#x20;   "auth\_dnsmasq": "1",

&#x20;   "dhcpfwd\_enable": "0",

&#x20;   "dtu\_cli\_tmot": "120",

&#x20;   "hs\_image": "",

&#x20;   "exempt\_rate\_up": "100",

&#x20;   "ppp\_ac": "",

&#x20;   "m2simswtch": "0",

&#x20;   "log\_enable": "0",

&#x20;   "sip\_domain": "192.168.1.1",

&#x20;   "wl0\_wds10\_if": "",

&#x20;   "filter\_web\_url10": "",

&#x20;   "ospf\_spfmax": "5000",

&#x20;   "wl0\_wds1\_ipaddr": "",

&#x20;   "dmz\_ipaddr": "0",

&#x20;   "gps\_en": "1",

&#x20;   "mqtt\_ser\_maxmsg": "1024",

&#x20;   "AR7100F": "AR7091F",

&#x20;   "pptpd\_client\_enable": "0",

&#x20;   "openvpn\_switch": "0",

&#x20;   "schedule\_hours": "0",

&#x20;   "sshd\_passwd\_auth": "1",

&#x20;   "rc\_startup": "",

&#x20;   "security\_mode\_last": "",

&#x20;   "wl0.3\_key1": "",

&#x20;   "AR7100G": "AR7091G",

&#x20;   "wol\_interval": "86400",

&#x20;   "wl0\_wds9\_netmask": "",

&#x20;   "sshd\_enable": "0",

&#x20;   "ddns\_hostname\_2": "",

&#x20;   "wl0.1\_radius\_ipaddr": "",

&#x20;   "wl0.3\_key2": "",

&#x20;   "ntrip\_netport": "",

&#x20;   "ddns\_hostname\_3": "",

&#x20;   "wl0.3\_key3": "",

&#x20;   "w1\_kpon\_lan\_switch": "10",

&#x20;   "af\_category": "0",

&#x20;   "radiooff\_boot\_off": "0",

&#x20;   "shutdown\_minutes": "0",

&#x20;   "l2tpclt\_pap": "0",

&#x20;   "l2tp\_client\_srvsec": "",

&#x20;   "ddns\_hostname\_4": "",

&#x20;   "wl0.3\_key4": "",

&#x20;   "AD7028-AS": "S9922S",

&#x20;   "dtu\_downlink\_port": "6003",

&#x20;   "wl0\_wds2\_ospf": "",

&#x20;   "wl0\_wds7\_ipaddr": "",

&#x20;   "ddns\_hostname\_5": "",

&#x20;   "wl0\_rateset": "default",

&#x20;   "wl0.1\_ssid": "",

&#x20;   "m1s2wanapn": "internet",

&#x20;   "enc\_conn\_timeout": "30",

&#x20;   "log\_allow": "",

&#x20;   "ddns\_hostname\_6": "",

&#x20;   "pptpd\_client\_srvuser": "User",

&#x20;   "wl0\_wme\_apsd": "on",

&#x20;   "macupd\_port": "2056",

&#x20;   "cloud\_heartenable": "1",

&#x20;   "ddns\_hostname\_7": "",

&#x20;   "wl0.3\_ipaddr": "0.0.0.0",

&#x20;   "ospf\_intenable": "0",

&#x20;   "openvpncl\_keep\_invl": "10",

&#x20;   "wl0\_wme\_txp\_vi": "7 3 4 2 0",

&#x20;   "pptpd\_acctport": "1813",

&#x20;   "ddns\_hostname\_8": "",

&#x20;   "ntrip\_password": "",

&#x20;   "premium\_rate\_up": "75",

&#x20;   "wl0\_wds6\_if": "",

&#x20;   "flow\_write\_ivl": "60",

&#x20;   "pppoe\_idletime": "5",

&#x20;   "ali\_iot\_ip0": "127.0.0.1",

&#x20;   "ping\_times": "",

&#x20;   "ali\_iot\_ip1": "127.0.0.1",

&#x20;   "rip\_enable": "0",

&#x20;   "pptpd\_client\_nat": "1",

&#x20;   "openvpn\_detectinval": "60",

&#x20;   "openvpn\_tlsauth": "",

&#x20;   "fullswitch": "0",

&#x20;   "lan\_ifname": "br0",

&#x20;   "procon\_cfgfile": "/etc/exdisk/m2mprocon/prodb",

&#x20;   "openvpn\_tun\_serip": "10.8.0.2",

&#x20;   "filter\_services": "",

&#x20;   "m1\_ppp3g\_assign": "0",

&#x20;   "openvpn\_onwan": "0",

&#x20;   "dtu\_rsnlen\_101": "2",

&#x20;   "dtu\_inval": "100",

&#x20;   "pptp\_extraoptions": "",

&#x20;   "gps\_devid": "18912345678",

&#x20;   "eth1\_bridged": "1",

&#x20;   "wl0\_wme\_txp\_vo": "7 3 4 2 0",

&#x20;   "encup\_checkdiscon": "0",

&#x20;   "pptp\_reorder": "1",

&#x20;   "wl0\_radius\_override": "1",

&#x20;   "wl0.1\_key1": "",

&#x20;   "dhcp\_domain": "wan",

&#x20;   "mqtt\_ser\_maxcnt": "16",

&#x20;   "mqtt\_proto": "1",

&#x20;   "AR7088-A": "S9922L",

&#x20;   "wl0.1\_key2": "",

&#x20;   "rip\_interfacename": "0",

&#x20;   "fon\_userlist": "",

&#x20;   "dtu\_rsnlen\_104": "2",

&#x20;   "samba\_mount": "0",

&#x20;   "wl0.1\_key3": "",

&#x20;   "wan\_pdp\_type": "IPV4V6",

&#x20;   "m1\_chap\_allowed": "1",

&#x20;   "openvpncl\_bridge": "0",

&#x20;   "wl0.1\_key4": "",

&#x20;   "pam\_deny": "0",

&#x20;   "AR7088-D": "S9922L",

&#x20;   "warn\_connlimit": "500",

&#x20;   "encup\_hearttime": "60",

&#x20;   "dtu\_stopbit1": "1",

&#x20;   "resetbutton\_enable": "1",

&#x20;   "block\_cookie": "0",

&#x20;   "w2\_kponfst": "",

&#x20;   "wan\_vdsl": "0",

&#x20;   "ospf\_linkauth": "0",

&#x20;   "AR7088-E": "S9922L",

&#x20;   "dtu\_srv\_txqtm1": "0",

&#x20;   "rc\_firewall": "",

&#x20;   "l2tp\_client\_assign": "0",

&#x20;   "mqtt\_ser\_mode": "0",

&#x20;   "mqtt\_comstopbit": "1",

&#x20;   "ezc\_enable": "1",

&#x20;   "AR7088-F": "S9922L",

&#x20;   "openvpn\_ip": "",

&#x20;   "NC\_enable": "0",

&#x20;   "wl0\_nmode\_protection": "auto",

&#x20;   "gps\_net": "0",

&#x20;   "wl1\_ssid": "Ricon-WiFi",

&#x20;   "dtu\_cache": "1",

&#x20;   "w2\_dns": "0.0.0.0",

&#x20;   "mqtt\_client\_id": "",

&#x20;   "eth5\_bridged": "1",

&#x20;   "wl0.1\_bridged": "1",

&#x20;   "ospf\_linkauthpwd": "123",

&#x20;   "smtp\_redirect\_destination": "0.0.0.0",

&#x20;   "svqos\_port3prio": "10",

&#x20;   "wl0.2\_radius\_key": "",

&#x20;   "dhcp\_num": "2",

&#x20;   "filter\_web\_url1": "",

&#x20;   "openvpn\_proxy": "0",

&#x20;   "openvpn\_mask": "0.0.0.0",

&#x20;   "filter\_web\_url2": "",

&#x20;   "pppoe\_redialperiod": "30",

&#x20;   "AR7000-DSP": "S1000-MEB",

&#x20;   "et0macaddr\_safe": "00:0C:43:43:5F:4E",

&#x20;   "dnsfilter\_policy": "DROP",

&#x20;   "filter\_web\_url3": "",

&#x20;   "AR7000-AP": "S1000-MEB",

&#x20;   "af\_country": "",

&#x20;   "wl0\_rts": "2347",

&#x20;   "filter\_web\_url4": "",

&#x20;   "m2detfail": "360",

&#x20;   "tcp\_congestion\_control": "vegas",

&#x20;   "w2\_kpon\_lan\_mode": "2",

&#x20;   "af\_ssid\_name": "AnchorFree WiFi",

&#x20;   "ospfd\_copt": "1",

&#x20;   "zebra\_conf": "",

&#x20;   "filter\_web\_url5": "",

&#x20;   "mulinkallon": "2",

&#x20;   "m1s1wandial": "0",

&#x20;   "fon\_enable": "0",

&#x20;   "filter\_web\_url6": "",

&#x20;   "wan\_wins": "0.0.0.0",

&#x20;   "ipsec\_detectimes": "2",

&#x20;   "AR7000-AS": "S9922XL",

&#x20;   "openvpn\_port": "1194",

&#x20;   "snmpd\_syscontact": "root",

&#x20;   "wds1.1": "",

&#x20;   "wl0\_wds4\_enable": "0",

&#x20;   "ipv6\_enable": "0",

&#x20;   "ntp\_mode": "auto",

&#x20;   "http\_enable": "1",

&#x20;   "filter\_web\_url7": "",

&#x20;   "wds1.2": "",

&#x20;   "wl0\_wds5\_if": "",

&#x20;   "wl0\_radauth": "0",

&#x20;   "l2tp\_pass": "1",

&#x20;   "filter\_web\_url8": "",

&#x20;   "pppoe\_mppe": "",

&#x20;   "eth9\_bridged": "1",

&#x20;   "svqos\_ips": "",

&#x20;   "wds1.3": "",

&#x20;   "ddns\_dyndnstype": "",

&#x20;   "wl0.2\_auth\_mode": "disabled",

&#x20;   "filter\_web\_url9": "",

&#x20;   "m2s1wandial": "card",

&#x20;   "pptpd\_client\_rebootivl": "30",

&#x20;   "enc\_mode": "0",

&#x20;   "wds1.4": "",

&#x20;   "ntpserver\_enable": "0",

&#x20;   "l2tp\_use\_dhcp": "0",

&#x20;   "w2\_connfailbt": "0",

&#x20;   "ntrip\_serv\_password": "",

&#x20;   "gps\_com": "0",

&#x20;   "eth4\_ipaddr": "0.0.0.0",

&#x20;   "encup\_devid": "",

&#x20;   "wds1.5": "",

&#x20;   "sshd\_rsa\_host\_key": "",

&#x20;   "wl0\_wpa\_gtk\_rekey": "3600",

&#x20;   "ipsec\_link": "3",

&#x20;   "wds1.6": "",

&#x20;   "l2tpclt\_mppestateless": "1",

&#x20;   "mac\_clone\_enable": "0",

&#x20;   "wl0\_sta\_retry\_time": "5",

&#x20;   "ppp\_get\_srv": "",

&#x20;   "ospf\_vtydead": "40",

&#x20;   "bgp\_ebgpmultihop": "0",

&#x20;   "mqtt\_com": "1",

&#x20;   "wds1.7": "",

&#x20;   "wl0\_wds3\_hwaddr": "",

&#x20;   "wds1.8": "",

&#x20;   "wan\_mtu": "1500",

&#x20;   "wl0\_key": "1",

&#x20;   "AR7088-W": "S9922L",

&#x20;   "AR7000-WSP": "S1000-MEB",

&#x20;   "eth1\_netmask": "0.0.0.0",

&#x20;   "openvpn\_key": "",

&#x20;   "openvpncl\_nat": "0",

&#x20;   "dnsfilter\_enable": "0",

&#x20;   "wds1.9": "",

&#x20;   "static\_wan\_ipaddr": "192.168.20.100",

&#x20;   "pptpclt\_mppe128b": "1",

&#x20;   "openvpn\_tun\_netmask": "",

&#x20;   "syslog\_pri\_ker": "4",

&#x20;   "filter\_macmode": "deny",

&#x20;   "wl0\_wds9\_hwaddr": "",

&#x20;   "wl0.2\_closed": "0",

&#x20;   "svqos\_port1prio": "10",

&#x20;   "NC\_LoginTimeout": "86400",

&#x20;   "enc\_sertm": "200",

&#x20;   "debuglog\_enable": "1",

&#x20;   "sshd\_wanport": "22",

&#x20;   "dnsmasq\_options": "",

&#x20;   "rip\_version": "1",

&#x20;   "time\_zone": "+03",

&#x20;   "openvpn\_statickey": "",

&#x20;   "pam\_tacplus\_ser1": "",

&#x20;   "dtu\_srv\_tmot": "2700",

&#x20;   "dtu\_parity1": "1",

&#x20;   "boot\_day\_e": "1",

&#x20;   "l2tp\_username": "User",

&#x20;   "m1\_ipv4v6": "0",

&#x20;   "pam\_tacplus\_ser2": "",

&#x20;   "mqtt\_user": "",

&#x20;   "af\_state": "",

&#x20;   "ttraff\_enable": "0",

&#x20;   "wl0\_wds2\_ipaddr": "",

&#x20;   "ali\_iot\_name0": "telnet\_local",

&#x20;   "traffic\_mac\_amount\_temp": "",

&#x20;   "netauth\_enable": "0",

&#x20;   "wl0.1\_netmask": "0.0.0.0",

&#x20;   "ali\_iot\_name1": "http\_localhost",

&#x20;   "wan\_ifname": "vlan0",

&#x20;   "eth5\_netmask": "0.0.0.0",

&#x20;   "enc\_iecaddlen\_101": "2",

&#x20;   "dtu\_srv\_heart1": "60",

&#x20;   "sshd\_authorized\_keys": "",

&#x20;   "radvd\_enable": "0",

&#x20;   "flow\_enable": "0",

&#x20;   "rip\_timeouttimer": "180",

&#x20;   "af\_ssid": "0",

&#x20;   "bulk\_ceil\_dn": "1",

&#x20;   "wl0\_dfs\_postism": "60",

&#x20;   "wan\_hostname": "",

&#x20;   "w2\_connfailsw": "10",

&#x20;   "m1s2band": "0",

&#x20;   "openvpn\_certauthmode": "0",

&#x20;   "openvpn\_tun\_netip": "",

&#x20;   "wl0\_wds8\_ipaddr": "",

&#x20;   "wl0\_radio": "1",

&#x20;   "af\_address": "",

&#x20;   "dtu\_databit": "1",

&#x20;   "zebra\_enable": "1",

&#x20;   "info\_passwd": "0",

&#x20;   "wl0.1\_wpa\_psk": "",

&#x20;   "login\_username": "riconadmin",

&#x20;   "wl0\_wds0": "",

&#x20;   "express\_ceil\_dn": "15",

&#x20;   "svqos\_port3bw": "FULL",

&#x20;   "wl0\_wds4\_if": "",

&#x20;   "wl0\_wds2\_netmask": "",

&#x20;   "wl0\_wds1": "",

&#x20;   "dtu\_check\_link\_mode": "1",

&#x20;   "shutdown\_day": "0",

&#x20;   "manual\_boot\_nv": "0",

&#x20;   "wl0\_bcn": "100",

&#x20;   "wl0\_wds2": "",

&#x20;   "flow\_memory": "1",

&#x20;   "openvpncl\_route": "",

&#x20;   "snmpd\_conf": "See http://www.net-snmp.org for expert snmpd.conf options",

&#x20;   "syslog\_to\_flash": "0",

&#x20;   "pptpd\_auth": "",

&#x20;   "l2tp\_auth": "",

&#x20;   "m1\_pap\_allowed": "1",

&#x20;   "wl0\_wds3": "",

&#x20;   "radio0\_on\_time": "111111111111111111111111",

&#x20;   "openvpn\_remode": "0",

&#x20;   "enc\_conn\_allon": "0",

&#x20;   "macupd\_interval": "10",

&#x20;   "reboot\_enable": "1",

&#x20;   "block\_multicast": "1",

&#x20;   "ppp\_static": "0",

&#x20;   "filter\_tod1": "",

&#x20;   "dtag\_vlan8": "0",

&#x20;   "wl0\_wds4": "",

&#x20;   "eth9\_netmask": "0.0.0.0",

&#x20;   "openvpncl\_certauthmode": "0",

&#x20;   "dyn\_default": "0",

&#x20;   "flow\_write\_fixmins": "50",

&#x20;   "filter\_tod2": "",

&#x20;   "pam\_tacplus\_port1": "49",

&#x20;   "log\_rejected": "0",

&#x20;   "AR7100": "AR7091",

&#x20;   "wl0\_wds5": "",

&#x20;   "openvpn\_authmode": "0",

&#x20;   "l2tp\_client\_srvmru": "1450",

&#x20;   "filter\_tod3": "",

&#x20;   "w1\_wan\_proto": "m13gdhcp",

&#x20;   "pam\_tacplus\_port2": "49",

&#x20;   "AD7828D": "AD7028D",

&#x20;   "wl0\_wds6": "",

&#x20;   "pptpclt\_pap": "1",

&#x20;   "dtu\_srv\_heart": "60",

&#x20;   "m1\_chapms\_v2\_allowed": "1",

&#x20;   "filter\_tod4": "",

&#x20;   "mqtt\_tlsproto": "tlsv1",

&#x20;   "ezc\_version": "2",

&#x20;   "wl0\_wds7": "",

&#x20;   "dnsmasq\_no\_dns\_rebind": "1",

&#x20;   "wk\_mode": "gateway",

&#x20;   "wl0\_gmode\_protection": "auto",

&#x20;   "filter\_tod5": "",

&#x20;   "wl0\_wds8": "",

&#x20;   "rc\_shutdown": "",

&#x20;   "wl0.2\_akm": "disabled",

&#x20;   "wl0.1\_wpa\_gtk\_rekey": "3600",

&#x20;   "filter\_tod6": "",

&#x20;   "ali\_iot\_type0": "TELNET",

&#x20;   "vrrp\_id": "100",

&#x20;   "ntrip\_serv\_ip": "",

&#x20;   "enable\_m2m": "0",

&#x20;   "AD7828G": "AD7028H",

&#x20;   "wl0\_wds9": "",

&#x20;   "qos\_done\_": "0",

&#x20;   "NC\_GatewayMode": "Open",

&#x20;   "wl0\_wds6\_netmask": "",

&#x20;   "filter\_tod7": "",

&#x20;   "ali\_iot\_type1": "HTTP",

&#x20;   "wl0\_radmacpassword": "0",

&#x20;   "filter\_tod8": "",

&#x20;   "ipsec\_detectinval": "60",

&#x20;   "m1s2wanapn\_cst": "internet",

&#x20;   "openvpn\_bridge": "0",

&#x20;   "wl0\_wds9\_desc": "",

&#x20;   "filter\_tod9": "",

&#x20;   "static\_wan\_gateway": "192.168.20.1",

&#x20;   "bulk\_ceil\_up": "1",

&#x20;   "run\_timeout": "10",

&#x20;   "ospf\_nettype": "0",

&#x20;   "bgp\_updatesource": "0",

&#x20;   "lan\_wins": "",

&#x20;   "vlan0hwname": "et0",

&#x20;   "dhcp\_dnsmasq": "1",

&#x20;   "NC\_IdleTimeout": "0",

&#x20;   "ip\_conntrack\_udp\_timeouts": "120",

&#x20;   "dhcpd\_options": "",

&#x20;   "w1\_kponm": "7",

&#x20;   "ospf\_vtytrdelay": "1",

&#x20;   "lan\_hwnames": "",

&#x20;   "AD7828L": "AD7028L",

&#x20;   "AR7088-FSTD": "S9922L",

&#x20;   "enc\_sertm1": "200",

&#x20;   "dtu\_flowctrl1": "1",

&#x20;   "gps\_netport": "",

&#x20;   "dhcpd\_usejffs": "0",

&#x20;   "static\_leases": "",

&#x20;   "wds\_watchdog\_enable": "0",

&#x20;   "express\_ceil\_up": "15",

&#x20;   "cloud\_enable": "1",

&#x20;   "reboot\_tm\_day": "0",

&#x20;   "m2\_chapms\_allowed": "1",

&#x20;   "pppoe\_demand": "0",

&#x20;   "bgp\_nexthopself": "0",

&#x20;   "AD7828N": "AD7028N",

&#x20;   "RemoteDomain": "",

&#x20;   "local\_dns": "0",

&#x20;   "wl0.3\_auth": "0",

&#x20;   "wl0\_wds10\_desc": "",

&#x20;   "wl0\_radius\_key": "",

&#x20;   "m2\_pap\_allowed": "1",

&#x20;   "filter\_dport\_grp10": "",

&#x20;   "wl0\_wme\_ap\_be": "15 63 3 0 0 off",

&#x20;   "wl0\_wds10\_netmask": "",

&#x20;   "wl0\_nmcsidx": "-1",

&#x20;   "m1s2wandial": "0",

&#x20;   "wl0\_lazy\_wds": "",

&#x20;   "openvpncl\_certtype": "0",

&#x20;   "encup\_netmode": "1",

&#x20;   "dtu\_addlen\_101": "2",

&#x20;   "mqtt\_serport": "",

&#x20;   "refresh\_time": "5",

&#x20;   "openvpn\_keep\_wait": "120",

&#x20;   "boot\_hours": "0",

&#x20;   "wshaper\_downlink\_": "0",

&#x20;   "wl0\_wds3\_if": "",

&#x20;   "wl0\_channel": "0",

&#x20;   "wl0\_wds5\_enable": "0",

&#x20;   "pptp\_encrypt": "0",

&#x20;   "m2s2wanapn": "3gnet",

&#x20;   "cert\_memory": "15",

&#x20;   "openvpn\_failreboot": "30",

&#x20;   "NC\_ForcedRedirect": "0",

&#x20;   "ddns\_wan\_ip": "1",

&#x20;   "m2s2wandial": "card",

&#x20;   "m1simfail": "90",

&#x20;   "ali\_iot\_retry\_count": "20",

&#x20;   "gps\_netip": "",

&#x20;   "wl0\_wme\_ap\_bk": "15 1023 7 0 0 off",

&#x20;   "dtu\_cli\_redialtm": "3",

&#x20;   "schedule\_hour\_time": "1",

&#x20;   "wl0\_wds7\_desc": "",

&#x20;   "wl0\_wds10\_enable": "0",

&#x20;   "dr\_setting": "0",

&#x20;   "m1\_ppp3g\_assigngw": "0",

&#x20;   "smsctrl\_aply": "1",

&#x20;   "AD7828W": "AD7028W",

&#x20;   "openvpn\_ca": "",

&#x20;   "openvpn\_startip": "0.0.0.0",

&#x20;   "hs\_redirect": "",

&#x20;   "http\_redirect\_destination": "0.0.0.0",

&#x20;   "eth5\_ipaddr": "0.0.0.0",

&#x20;   "urlfilter\_ips\_temp": "",

&#x20;   "dhcpc\_vendorclass": "",

&#x20;   "wol\_hostname": "",

&#x20;   "wl0\_wds4\_hwaddr": "",

&#x20;   "pptpd\_lip": "",

&#x20;   "openvpn\_endip": "0.0.0.0",

&#x20;   "dtu\_databit1": "1",

&#x20;   "filter\_rule10": "",

&#x20;   "bgp\_neighborip": "192.168.1.254",

&#x20;   "m1s1wanapn": "internet",

&#x20;   "eth2\_bridged": "1",

&#x20;   "forwardspec\_entries": "0",

&#x20;   "rflow\_if": "br0",

&#x20;   "wshaper\_enable\_": "0",

&#x20;   "wl0.1\_auth": "0",

&#x20;   "dtu\_srv\_txqtm": "0",

&#x20;   "NC\_AllowedWebHosts": "",

&#x20;   "def\_whwaddr": "00:00:00:00:00:00",

&#x20;   "wl0\_auth\_mode": "disabled",

&#x20;   "w1\_kponfailsw": "2",

&#x20;   "dhcpc\_requestip": "",

&#x20;   "status\_auth": "1",

&#x20;   "wl0.3\_closed": "0",

&#x20;   "gretap\_conns": "",

&#x20;   "autofw\_port0": "",

&#x20;   "ospf\_intname": "0",

&#x20;   "gps\_priproto": "2",

&#x20;   "warn\_enabled": "0",

&#x20;   "language": "english",

&#x20;   "wl0\_crypto": "tkip+aes",

&#x20;   "AR7088-ESTD": "S9922L",

&#x20;   "dtu\_mtu1": "1024",

&#x20;   "cloud\_log\_tm": "10",

&#x20;   "def\_hwaddr": "00:00:00:00:00:00",

&#x20;   "bgp\_enable": "0",

&#x20;   "boot\_week\_e": "0",

&#x20;   "port4vlan": "1",

&#x20;   "m2\_ipv4v6": "0",

&#x20;   "gps\_idadd": "1",

&#x20;   "mqtt\_combaud": "10",

&#x20;   "openvpn\_net": "0.0.0.0",

&#x20;   "pro\_gwlk\_en": "0",

&#x20;   "wl0\_wds9\_ospf": "",

&#x20;   "wl0\_wds5\_desc": "",

&#x20;   "wl0\_wds3\_ipaddr": "",

&#x20;   "macupd\_enable": "0",

&#x20;   "wl0.2\_bridged": "1",

&#x20;   "static\_wan\_netmask": "255.255.255.0",

&#x20;   "rip\_preventloop": "0",

&#x20;   "eth6\_bridged": "1",

&#x20;   "mmc\_enable0": "0",

&#x20;   "cloud\_logenable": "0",

&#x20;   "ospf\_area": "0",

&#x20;   "rflow\_ip": "0.0.0.0",

&#x20;   "standard\_ceil\_dn": "10",

&#x20;   "limit\_l2tp": "0",

&#x20;   "limit\_telnet": "0",

&#x20;   "wl0.2\_radius\_ipaddr": "",

&#x20;   "wan\_cid": "3",

&#x20;   "filter\_dport\_grp1": "",

&#x20;   "w2\_kponretry": "4",

&#x20;   "bgp\_neighboras": "7674",

&#x20;   "pptpd\_client\_mru": "1450",

&#x20;   "wl0\_wds9\_ipaddr": "",

&#x20;   "rc\_custom": "",

&#x20;   "filter\_dport\_grp2": "",

&#x20;   "w1\_kponivl": "60",

&#x20;   "rip\_updatetimer": "30",

&#x20;   "vrrp\_priority": "10",

&#x20;   "vrrp\_linkwan": "0"

&#x20; },

&#x20; "nvram\_anahtar\_sayisi": 1560,

&#x20; "sim1": {

&#x20;   "iccid": "8990011626160064930F",

&#x20;   "imsi": "286016661026495",

&#x20;   "imei": "867191084820421",

&#x20;   "aktif\_sim\_yuvasi": "SIM1",

&#x20;   "sim\_durumu": "OK",

&#x20;   "sebeke\_tipi": "FDD LTE",

&#x20;   "band": "LTE-FDD B7",

&#x20;   "modul\_adi": "Q200AF",

&#x20;   "sinyal\_dbm": "65",

&#x20;   "hucre\_id": "70D02C",

&#x20;   "sinyal\_gurultu": "19",

&#x20;   "wan\_ip": "31.140.144.25",

&#x20;   "wan\_ag\_gecidi": "31.140.144.230",

&#x20;   "wan\_dns": "213.74.0.4 213.74.1.4",

&#x20;   "bagli\_sure": "0:50:00",

&#x20;   "wan\_protokol": "m13gdhcp",

&#x20;   "iccid\_temiz": "8990011626160064930",

&#x20;   "operator": "Turkcell"

&#x20; },

&#x20; "sim2": {

&#x20;   "aktif\_sim\_yuvasi": "SIM2",

&#x20;   "sim\_durumu": "Invalid",

&#x20;   "bagli\_sure": "Not available",

&#x20;   "wan\_protokol": "dhcp"

&#x20; },

&#x20; "sistem": {

&#x20;   "lan\_ip": "192.168.1.1",

&#x20;   "lan\_mac": "00:0C:43:43:5F:4E",

&#x20;   "lan\_mac\_uretici": "Ralink/MediaTek",

&#x20;   "wan\_mac1": "02:0C:29:A3:9B:6D",

&#x20;   "wifi\_durum": "Radio is Off",

&#x20;   "wifi\_kanal": "Unknown",

&#x20;   "uptime": "10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09",

&#x20;   "bellek": ",'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000",

&#x20;   "lan\_proto": "dhcp"

&#x20; },

&#x20; "ok": true

}



Ricon modem — 192.168.1.1  (2026-08-26T07:55:51.329Z)



&#x20; Sistem:

&#x20;   lan\_ip          : 192.168.1.1

&#x20;   lan\_mac         : 00:0C:43:43:5F:4E

&#x20;   lan\_mac\_uretici : Ralink/MediaTek

&#x20;   wan\_mac1        : 02:0C:29:A3:9B:6D

&#x20;   wifi\_durum      : Radio is Off

&#x20;   wifi\_kanal      : Unknown

&#x20;   uptime          : 10:55:52 up 50 Min.,  load average: 0.05, 0.12, 0.09

&#x20;   bellek          : ,'MemTotal:','60408','MemFree:','35368','Buffers:','3140','Cached:','10272','Active:','5264','Inactive:','10000

&#x20;   lan\_proto       : dhcp



&#x20; SIM1:

&#x20;   iccid           : 8990011626160064930F

&#x20;   imsi            : 286016661026495

&#x20;   imei            : 867191084820421

&#x20;   aktif\_sim\_yuvasi: SIM1

&#x20;   sim\_durumu      : OK

&#x20;   sebeke\_tipi     : FDD LTE

&#x20;   band            : LTE-FDD B7

&#x20;   modul\_adi       : Q200AF

&#x20;   sinyal\_dbm      : 65

&#x20;   hucre\_id        : 70D02C

&#x20;   sinyal\_gurultu  : 19

&#x20;   wan\_ip          : 31.140.144.25

&#x20;   wan\_ag\_gecidi   : 31.140.144.230

&#x20;   wan\_dns         : 213.74.0.4 213.74.1.4

&#x20;   bagli\_sure      : 0:50:00

&#x20;   wan\_protokol    : m13gdhcp

&#x20;   iccid\_temiz     : 8990011626160064930

&#x20;   operator        : Turkcell



&#x20; SIM2:

&#x20;   aktif\_sim\_yuvasi: SIM2

&#x20;   sim\_durumu      : Invalid

&#x20;   bagli\_sure      : Not available

&#x20;   wan\_protokol    : dhcp



&#x20; nvram: 1560 anahtar cekildi

PS C:\\Projeler\\ricon\_modem>

