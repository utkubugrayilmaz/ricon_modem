<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
	<head>
		<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />
		<link type="text/css" rel="stylesheet" href="/style/common.css" />
		<script type="text/javascript" src="/lang_pack/language.js"></script>
		<script type="text/javascript" src="/common.js"></script>
		<script type="text/javascript" src="/include.js"></script>
		<script type="text/javascript" src="/js/prototype.js"></script>
		<script type="text/javascript" src="/js/effects.js"></script>
		<script type="text/javascript" src="/js/window.js"></script>
		<script type="text/javascript" src="/js/window_effects.js"></script>

<script type="text/javascript" src="index_static.asp"></script>
<script type="text/javascript" src="index_pppoe.asp"></script>
<script type="text/javascript" src="index_m13g.asp"></script>
<script type="text/javascript" src="index_m13gdhcp.asp"></script>
<script type="text/javascript" src="index_m23g.asp"></script>
<script type="text/javascript" src="index_m23gdhcp.asp"></script>
<script type="text/javascript">
//<![CDATA[
var index_dhcp="";
var index_wifidhcp="";
var index_disabled="";
var w1_wan_proto = "m13gdhcp";
var w2_wan_proto = "dhcp";
function pptpUseDHCP(F, val) {
setElementsActive("wan_ipaddr_0", "wan_gateway_3", val==0)
}
function valid_mtu(I) {
var start = null;
var end = null;
if(w1_wan_proto == "pppoe" || w2_wan_proto == "pppoe") {
start = 576;
end = 1492;
} else {
start = 576;
end = 16320;
}
valid_range(I,start,end,"MTU");
}
function SelMTU(num,F) {
mtu_enable_disable(F,num);
}
function mtu_enable_disable(F,I) {
if ( I == "0" )
choose_disable(F.wan_mtu);
else
choose_enable(F.wan_mtu);
}
function valid_value(F) {
return true;
}
var wanprotos="disabled|share.disabled;static|idx.static_ip,dhcp|idx.dhcp,pppoe|PPPoE;m13g|share.umts,m13gdhcp|share.umtsdhcp;";
function MakeWan(itthis, itthat)
{var wanthis=itthis.value;
var wanthat=itthat.value;
itthat.length=0;
var args=wanprotos.split(';');
for (var i=0; i < args.length-1; i++) {
var litargs=args[i].split(',');
for (var j=0; j < litargs.length; j++) {
var vv = litargs[j].split('|');
if (wanthis!="disabled"&&wanthis==vv[0]) {
break;
}
}
if (j != litargs.length) {
continue;
}
for (var j=0; j < litargs.length; j++) {
var vv = litargs[j].split('|');
if (vv[1].indexOf(".") != -1) {
vv[1] = eval(vv[1]);
}
itthat.add(new Option(vv[1],vv[0],0,vv[0]==wanthat));
}
}
return;
}
function SelWAN(F, w, t) {
MakeWan(eval('F.'+w+'_wan_proto'), eval('F.'+t+'_wan_proto'));
eval('setElementVisible("id'+w+'wanproto", F.'+w+'_wan_proto.value!="disabled")');
var wan_proto=eval('F.'+w+'_wan_proto.value');
eval('dId("'+w+'content").innerHTML=index_'+wan_proto);
return;
}
function submitcheck(F) {
if(valid_value(F)) {
F.submit_type.value = "";
F.change_action.value = "";
F.save_button.value = sbutton.saving;
return true;
} else {
return false;
}
}
function to_submit(F) {
if (submitcheck(F)) {
set_check(F);
apply(F);
}
}
function to_apply(F) {
if (submitcheck(F)) {
set_check(F);
applytake(F);
}
}
addEvent(window, "load", function() {
MakeWan(dName("w1_wan_proto")[0],dName("w2_wan_proto")[0]);
MakeWan(dName("w2_wan_proto")[0],dName("w1_wan_proto")[0]);
load_select("w1_wan_proto","m13gdhcp");
load_select("w2_wan_proto","dhcp");
load_select("w1_kponm","7");
load_select("w2_kponm","1");
load_select("w1_kpon_lan_mode","1");
load_select("w2_kpon_lan_mode","2");
load_select("w1_lnkp","1");
load_select("w2_lnkp","1");

mtu_enable_disable(document.setup,'0');

});
addEvent(window, "unload", function() {
});
//]]>
</script>
</head>
<body class="gui">
<div id="wrapper">
<div id="content">
<script type="text/javascript">showheader('setup/Hindex.asp');</script>
<script type="text/javascript">var menu='<div class="menuOne"><a target=main href="/asp/status/Info.htm"><strong>'+bmenu.statu+'</strong></a></div><div class="current menuOne"><span><strong>'+bmenu.setup+'</strong></span></div><div id="menuSub"><ul id="menuSubList" class="menuSubList"><li><span><a target=main href="/asp/setup/index.asp"><strong>'+bmenu.setupbasic+'</strong></a></li></span><li><a target=main href="/asp/setup/lansetup.asp"><strong>'+bmenu.lansetup+'</strong></a></li><li><a target=main href="/asp/setup/Wireless_Basic.asp"><strong>'+bmenu.wlan+'</strong></a></li><li><a target=main href="/asp/setup/dhcpserver.asp"><strong>'+bmenu.dhcpserver+'</strong></a></li><li><a target=main href="/asp/setup/DDNS.asp"><strong>'+bmenu.setupddns+'</strong></a></li><li><a target=main href="/asp/setup/WanMAC.asp"><strong>'+bmenu.setupmacclone+'</strong></a></li><li><a target=main href="/asp/setup/statichosts.asp"><strong>'+bmenu.statichosts+'</strong></a></li></ul></div><div class="menuOne"><a target=main href="/asp/setupex/Routing.asp"><strong>'+bmenu.setupex+'</strong></a></div><div class="menuOne"><a target=main href="/asp/servicesVPN/PPTP.asp"><strong>'+bmenu.servicesVPN+'</strong></a></div><div class="menuOne"><a target=main href="/asp/security/Firewall.asp"><strong>'+bmenu.security+'</strong></a></div><div class="menuOne"><a target=main href="/asp/custqos/Ttraff.asp"><strong>'+bmenu.qos+'</strong></a></div><div class="menuOne"><a target=main href="/asp/custapp/Serial_App.asp"><strong>'+bmenu.app+'</strong></a></div><div class="menuOne"><a target=main href="/asp/admin/Management.asp"><strong>'+bmenu.admin+'</strong></a></div>';if (top.menu.document.readyState != "complete"){g_menu = menu;g_menu_time=setTimeout("timemenu()",100);}else{top.menu.document.getElementById("menuMainList").innerHTML = menu;}</script>
<div id="main" class="mainLeft">
<div id="contents" class="contents">
<form name="setup" action="/apply.cgi" method="post">
<input type="hidden" name="submit_class" value="setup" />
<input type="hidden" name="submit_button" value="index" />
<input type="hidden" name="action" value="Apply" />
<input type="hidden" name="change_action"/>
<input type="hidden" name="submit_type" />
<h2><script type="text/javascript">Capture(idx.h2)</script></h2>
<fieldset>
<legend><script type="text/javascript">Capture(idx.duallinkop)</script></legend>
<div class="setting" >
<div class="label"><script type="text/javascript">Capture(idx.bothonline)</script></div>
<input type="radio" name="mulinkallon" value="1"  /> <script type="text/javascript">Capture(idx.bothonen)</script>
<input type="radio" name="mulinkallon" value="0"  /> <script type="text/javascript">Capture(idx.bothondis)</script>
<input type="radio" name="mulinkallon" value="2" checked="checked" /> <script type="text/javascript">Capture(idx.onelink)</script>
<span class="default"><script type="text/javascript">Capture(idx.autoreturn)</script></span>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.duallinkfail)</script></div>
<input class="num" maxlength="4" size="5" name="mullinkfail" value="30" /><script type="text/javascript">Capture(share.minutes)</script><span class="default"><script type="text/javascript">Capture(share.disables)</script></span>
</div>
</fieldset>
<fieldset>
<legend><script type="text/javascript">Capture(idx.legend)</script> - <script type="text/javascript">Capture(idx.legendmain)</script></legend>
<!--
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.conn_type)</script></div>
<script type="text/javascript">Capture(share.disabled)</script>
</div>
-->

<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.conn_type)</script></div>
<select name="w1_wan_proto" onchange="SelWAN(this.form,'w1','w2')" >
</select>
</div>
<div id="idw1wanproto" style="display:none;">
<div id="w1content"></div>
<br>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx_h.reconnect)</script></div>
<input type="radio" value="1" name="w1_recon"  onclick="show_layer_ext(this, 'w1_idreconnect', true)" /><script type="text/javascript">Capture(share.enable)</script>
<input type="radio" value="0" name="w1_recon" checked="checked" onclick="show_layer_ext(this, 'w1_idreconnect', false)" /><script type="text/javascript">Capture(share.disable)</script>
</div>
<div class="setting" id="w1_idreconnect" style='visibility:hidden;display:none;'>
<div class="label"><script type="text/javascript">Capture(share.time)</script></div>
<select name="w1_recon_h">
<option value="0"  >00</option>
<option value="1"  >01</option>
<option value="2"  >02</option>
<option value="3"  >03</option>
<option value="4"  >04</option>
<option value="5"  >05</option>
<option value="6"  >06</option>
<option value="7"  >07</option>
<option value="8"  >08</option>
<option value="9"  >09</option>
<option value="10"  >10</option>
<option value="11"  >11</option>
<option value="12"  >12</option>
<option value="13"  >13</option>
<option value="14"  >14</option>
<option value="15"  >15</option>
<option value="16"  >16</option>
<option value="17"  >17</option>
<option value="18"  >18</option>
<option value="19"  >19</option>
<option value="20"  >20</option>
<option value="21"  >21</option>
<option value="22"  >22</option>
<option value="23"  >23</option>

</select>:<select name="w1_recon_m">
<option value="0"  >00</option>
<option value="1"  >01</option>
<option value="2"  >02</option>
<option value="3"  >03</option>
<option value="4"  >04</option>
<option value="5"  >05</option>
<option value="6"  >06</option>
<option value="7"  >07</option>
<option value="8"  >08</option>
<option value="9"  >09</option>
<option value="10"  >10</option>
<option value="11"  >11</option>
<option value="12"  >12</option>
<option value="13"  >13</option>
<option value="14"  >14</option>
<option value="15"  >15</option>
<option value="16"  >16</option>
<option value="17"  >17</option>
<option value="18"  >18</option>
<option value="19"  >19</option>
<option value="20"  >20</option>
<option value="21"  >21</option>
<option value="22"  >22</option>
<option value="23"  >23</option>
<option value="24"  >24</option>
<option value="25"  >25</option>
<option value="26"  >26</option>
<option value="27"  >27</option>
<option value="28"  >28</option>
<option value="29"  >29</option>
<option value="30"  >30</option>
<option value="31"  >31</option>
<option value="32"  >32</option>
<option value="33"  >33</option>
<option value="34"  >34</option>
<option value="35"  >35</option>
<option value="36"  >36</option>
<option value="37"  >37</option>
<option value="38"  >38</option>
<option value="39"  >39</option>
<option value="40"  >40</option>
<option value="41"  >41</option>
<option value="42"  >42</option>
<option value="43"  >43</option>
<option value="44"  >44</option>
<option value="45"  >45</option>
<option value="46"  >46</option>
<option value="47"  >47</option>
<option value="48"  >48</option>
<option value="49"  >49</option>
<option value="50"  >50</option>
<option value="51"  >51</option>
<option value="52"  >52</option>
<option value="53"  >53</option>
<option value="54"  >54</option>
<option value="55"  >55</option>
<option value="56"  >56</option>
<option value="57"  >57</option>
<option value="58"  >58</option>
<option value="59"  >59</option>

</select>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.connectfail0)</script></div>
<input class="num" maxlength="4" size="5" name="w1_connfailsw" value="10" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.connectfail1)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.restartppp)</script></div>
<input class="num" maxlength="4" size="5" name="w1_connfailbt" value="0" /><script type="text/javascript">Capture(share.minutes)</script><span class="default"><script type="text/javascript">Capture(share.disables)</script></span>
</div>
<br>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnMode)</script></div>
<select name="w1_kponm" onchange="selhide(this, 'w1_kponaddr', 5);selhide(this, 'w1_kpon', 1);">
<option value="1">None</option>
<option value="2">ICMP</option>
<option value="5">PPP</option>
<option value="6">Route</option>
<option value="7">ICMP+</option>
</select>
</div>
<div id="w1_kpon" >
<div id="w1_kponaddr" >
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpDest)</script></div>
<input name="w1_kponfst" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpDest)" value="8.8.8.8"/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpSecDest)</script></div>
<input name="w1_kponsec" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpSecDest)" value=""/>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnInterval)</script></div>
<input class="num" maxlength="4" size="5" name="w1_kponivl" value="60" /><script type="text/javascript">Capture(share.secs)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnfail0)</script></div>
<input class="num" maxlength="4" size="5" name="w1_kponfailsw" value="2" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.KpOnfail1)</script>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnMode_lan)</script></div>
<select name="w1_kpon_lan_mode" onchange="selhide(this, 'id_w1_kponm', '1');">
<option value="1">None</option>
<option value="2">ICMP+LAN</option>
</select>
</div>
<div id="id_w1_kponm">
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpDest)</script></div>
<input name="w1_kpon_lan_dst" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpDest)" value=""/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnInterval)</script></div>
<input class="num"  maxlength="4" size="5" name="w1_kpon_lan_ivl" value="60" /><script type="text/javascript">Capture(share.secs)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnfail0)</script></div>
<input class="num"  maxlength="4" size="5" name="w1_kpon_lan_switch" value="10" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.KpOnfail1)</script>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKp)</script></div>
<select name="w1_lnkp" onchange="selhide(this, 'w1_lnkpm', 1);">
<option value="1">None</option>
<option value="2">Ping</option>
</select>
</div>
<div id="w1_lnkpm" style='visibility:hidden;display:none;'>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKpIp)</script></div>
<input name="w1_lnkpip" size="25" maxlength="40" onblur="valid_name(this,idx.LnKpIp)" value=""/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKpInterval)</script></div>
<input class="num" maxlength="4" size="5" name="w1_lnkpnivl" value="5" /><script type="text/javascript">Capture(share.secs)</script>
</div>
</div>
</div>

</fieldset>
<fieldset >
<legend><script type="text/javascript">Capture(idx.legend)</script> - <script type="text/javascript">Capture(idx.legendbkup)</script></legend>
<!--
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.conn_type)</script></div>
<script type="text/javascript">Capture(share.disabled)</script>
</div>
-->

<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.conn_type)</script></div>
<select name="w2_wan_proto" onchange="SelWAN(this.form,'w2','w1')">
</select>
</div>
<div id="idw2wanproto" style="display:none;">
<div id="w2content"></div>
<br>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx_h.reconnect)</script></div>
<input type="radio" value="1" name="w2_recon"  onclick="show_layer_ext(this, 'w2_idreconnect', true)" /><script type="text/javascript">Capture(share.enable)</script>
<input type="radio" value="0" name="w2_recon" checked="checked" onclick="show_layer_ext(this, 'w2_idreconnect', false)" /><script type="text/javascript">Capture(share.disable)</script>
</div>
<div class="setting" id="w2_idreconnect" style='visibility:hidden;display:none;'>
<div class="label"><script type="text/javascript">Capture(share.time)</script></div>
<select name="w2_recon_h">
<option value="0"  >00</option>
<option value="1"  >01</option>
<option value="2"  >02</option>
<option value="3"  >03</option>
<option value="4"  >04</option>
<option value="5"  >05</option>
<option value="6"  >06</option>
<option value="7"  >07</option>
<option value="8"  >08</option>
<option value="9"  >09</option>
<option value="10"  >10</option>
<option value="11"  >11</option>
<option value="12"  >12</option>
<option value="13"  >13</option>
<option value="14"  >14</option>
<option value="15"  >15</option>
<option value="16"  >16</option>
<option value="17"  >17</option>
<option value="18"  >18</option>
<option value="19"  >19</option>
<option value="20"  >20</option>
<option value="21"  >21</option>
<option value="22"  >22</option>
<option value="23"  >23</option>

</select>:<select name="w2_recon_m">
<option value="0"  >00</option>
<option value="1"  >01</option>
<option value="2"  >02</option>
<option value="3"  >03</option>
<option value="4"  >04</option>
<option value="5"  >05</option>
<option value="6"  >06</option>
<option value="7"  >07</option>
<option value="8"  >08</option>
<option value="9"  >09</option>
<option value="10"  >10</option>
<option value="11"  >11</option>
<option value="12"  >12</option>
<option value="13"  >13</option>
<option value="14"  >14</option>
<option value="15"  >15</option>
<option value="16"  >16</option>
<option value="17"  >17</option>
<option value="18"  >18</option>
<option value="19"  >19</option>
<option value="20"  >20</option>
<option value="21"  >21</option>
<option value="22"  >22</option>
<option value="23"  >23</option>
<option value="24"  >24</option>
<option value="25"  >25</option>
<option value="26"  >26</option>
<option value="27"  >27</option>
<option value="28"  >28</option>
<option value="29"  >29</option>
<option value="30"  >30</option>
<option value="31"  >31</option>
<option value="32"  >32</option>
<option value="33"  >33</option>
<option value="34"  >34</option>
<option value="35"  >35</option>
<option value="36"  >36</option>
<option value="37"  >37</option>
<option value="38"  >38</option>
<option value="39"  >39</option>
<option value="40"  >40</option>
<option value="41"  >41</option>
<option value="42"  >42</option>
<option value="43"  >43</option>
<option value="44"  >44</option>
<option value="45"  >45</option>
<option value="46"  >46</option>
<option value="47"  >47</option>
<option value="48"  >48</option>
<option value="49"  >49</option>
<option value="50"  >50</option>
<option value="51"  >51</option>
<option value="52"  >52</option>
<option value="53"  >53</option>
<option value="54"  >54</option>
<option value="55"  >55</option>
<option value="56"  >56</option>
<option value="57"  >57</option>
<option value="58"  >58</option>
<option value="59"  >59</option>

</select>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.connectfail0)</script></div>
<input class="num" maxlength="4" size="5" name="w2_connfailsw" value="10" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.connectfail1)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.restartppp)</script></div>
<input class="num" maxlength="4" size="5" name="w2_connfailbt" value="0" /><script type="text/javascript">Capture(share.minutes)</script><span class="default"><script type="text/javascript">Capture(share.disables)</script></span>
</div>
<br>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnMode)</script></div>
<select name="w2_kponm" onchange="selhide(this, 'w2_kponaddr', 5);selhide(this, 'w2_kpon', 1);">
<option value="1">None</option>
<option value="2">ICMP</option>
<option value="5">PPP</option>
<option value="6">Route</option>
<option value="7">ICMP+</option>
</select>
</div>
<div id="w2_kpon" style='visibility:hidden;display:none;'>
<div id="w2_kponaddr" >
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpDest)</script></div>
<input name="w2_kponfst" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpDest)" value=""/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpSecDest)</script></div>
<input name="w2_kponsec" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpSecDest)" value=""/>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnInterval)</script></div>
<input class="num" maxlength="4" size="5" name="w2_kponivl" value="60" /><script type="text/javascript">Capture(share.secs)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnfail0)</script></div>
<input class="num" maxlength="4" size="5" name="w2_kponfailsw" value="1" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.KpOnfail1)</script>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnMode_lan)</script></div>
<select name="w2_kpon_lan_mode" onchange="selhide(this, 'id_w2_kponm', '1');">
<option value="1">None</option>
<option value="2">ICMP+LAN</option>
</select>
</div>
<div id="id_w2_kponm">
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnIcmpDest)</script></div>
<input name="w2_kpon_lan_dst" size="25" maxlength="40" onblur="valid_name(this,idx.KpOnIcmpDest)" value="192.168.254.1"/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnInterval)</script></div>
<input class="num"  maxlength="4" size="5" name="w2_kpon_lan_ivl" value="60" /><script type="text/javascript">Capture(share.secs)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.KpOnfail0)</script></div>
<input class="num"  maxlength="4" size="5" name="w2_kpon_lan_switch" value="2" /><script type="text/javascript">Capture(share.tt)</script><script type="text/javascript">Capture(idx.KpOnfail1)</script>
</div>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKp)</script></div>
<select name="w2_lnkp" onchange="selhide(this, 'w2_lnkpm', 1);">
<option value="1">None</option>
<option value="2">Ping</option>
</select>
</div>
<div id="w2_lnkpm" style='visibility:hidden;display:none;'>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKpIp)</script></div>
<input name="w2_lnkpip" size="25" maxlength="40" onblur="valid_name(this,idx.LnKpIp)" value=""/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.LnKpInterval)</script></div>
<input class="num" maxlength="4" size="5" name="w2_lnkpnivl" value="5" /><script type="text/javascript">Capture(share.secs)</script>
</div>
</div>
</div>

</fieldset>
<fieldset>
<legend><script type="text/javascript">Capture(idx.optional)</script></legend>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(share.routername)</script></div>
<input maxlength="39" name="router_name" size="20" onblur="valid_name(this,&#34;Router%20Name&#34;)" value="Industrial Cellular Router"/>
</div>

<div class="setting">
<div class="label"><script type="text/javascript">Capture(share.hostname)</script></div>
<input maxlength="39" name="wan_hostname" size="20" onblur="valid_name(this,&#34;Host%20Name&#34;)" value=""/>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(share.domainname)</script></div>
<input maxlength="79" name="wan_domain" size="20" onblur="valid_name(this,&#34;Domain%20name&#34;,SPACE_NO)" value="" />
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.mtu)</script></div>
<select name="mtu_enable" onchange="SelMTU(this.form.mtu_enable.selectedIndex,this.form)">
<option value="0" selected><script type="text/javascript">Capture(share.auto)</script></option>
<script type="text/javascript">
//<![CDATA[
document.write("<option value=\"1\"  >" + share.manual + "</option>");
//]]>
</script>
</select>&nbsp;
<input class="num" maxlength="4" onblur="valid_mtu(this)" size="5" name="wan_mtu" value="1500" />
</div>

<div style="visibility:hidden;display:none;">
<div class="setting">
<div class="label">Wan Nat</div>
<input type="radio" value="1" name="wan_nat" checked="checked" /><script type="text/javascript">Capture(share.enable)</script>
<input type="radio" value="0" name="wan_nat"  /><script type="text/javascript">Capture(share.disable)</script>
</div>
<div class="setting">
<div class="label"><script type="text/javascript">Capture(idx.stp)</script></div>
<input type="radio" value="1" name="lan_stp"  /><script type="text/javascript">Capture(share.enable)</script>
<input type="radio" value="0" name="lan_stp" checked="checked" /><script type="text/javascript">Capture(share.disable)</script>
</div>
</div>
</fieldset>
<div class="submitFooter">
<script type="text/javascript">
//<![CDATA[
submitFooterButton(1,1);
//]]>
</script>
</div>
</form>
</div>
</div>
</div>
</div>
</body>
</html>
