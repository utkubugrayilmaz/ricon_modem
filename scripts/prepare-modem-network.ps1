<#
  Ag adaptorunu kullanip modemin GERCEK LAN IP'sini bulur (DHCP ile), sonra
  bilgisayarin kendi ayarini eski haline dondurup uzerine iki ikincil IP
  ekler: kesfedilen alt agda biri, sabit 5.5.5.100 biri (provizyon sonunda
  modem hep 5.5.5.1'e cekildigi icin o alt aga da erisebilmemiz lazim).

  Neden bu script var: RVM makinesindeki bilgisayarin ag ayari onceden
  teknisyen tarafindan kurulmuyor artik; modem hangi IP'de gelirse gelsin
  (fabrika/saha/hatali) bu script bulup ayarliyor. Bkz. plan:
  DHCP-based modem IP discovery + safe network prep for `npm start`.

  Cikti sozlesmesi: TEK satir JSON [Console]::Out'a; her turlu ilerleme/log
  [Console]::Error'a (bin/ricon.js'in "stdout hep saf JSON" kuraliyla ayni
  neden — Write-Host burada KULLANILMAZ, etkilesimsiz calisirken bile gercek
  stdout'a sizip JSON'u bozabiliyor).
#>
param(
  [string]$AdapterName = "Ethernet",
  [int]$DhcpTimeoutSec = 15,
  [string]$FieldSecondaryIp = "5.5.5.100",
  [int]$PrefixLength = 24
)

$ErrorActionPreference = "Stop"

function Write-Progress2([string]$Message) {
  [Console]::Error.WriteLine("[prepare-network] $Message")
}

function Write-ResultAndExit($resultTable, [int]$exitCode) {
  $json = ($resultTable | ConvertTo-Json -Compress -Depth 6)
  [Console]::Out.WriteLine($json)
  exit $exitCode
}

# ADIM 0 — yonetici degilsek HICBIR SEYE dokunmadan dur. Normal kullanimda
# network-setup.js zaten yukselmeyi garanti ediyor; bu sadece .ps1 dogrudan
# calistirilirsa diye ikinci bir savunma hatti.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
  Write-ResultAndExit @{
    ok = $false; reason = "NOT_ELEVATED"; adapter = $AdapterName
    message = "Administrator privileges are required to modify network adapter settings."
  } 10
}

# ADIM 0.5 — adaptor gercekten var mi.
try {
  Get-NetAdapter -Name $AdapterName -ErrorAction Stop | Out-Null
} catch {
  Write-ResultAndExit @{
    ok = $false; reason = "ADAPTER_NOT_FOUND"; adapter = $AdapterName
    message = "No adapter named '$AdapterName' was found. Set MODEM_ADAPTER_NAME."
  } 11
}

$warnings = New-Object System.Collections.Generic.List[string]

# Bir IP'yi arayuze EKLEMEYE calisir; zaten varsa hata SAYMAZ (idempotent —
# ust uste calistirmak guvenli olsun diye).
function Ensure-SecondaryIp([string]$Ip, [int]$PrefixLen, [System.Collections.Generic.List[string]]$Added) {
  $existing = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -IPAddress $Ip -ErrorAction SilentlyContinue
  if ($existing) {
    $warnings.Add("$Ip already present, skipped")
    return
  }
  try {
    New-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $Ip -PrefixLength $PrefixLen `
      -SkipAsSource $true -ErrorAction Stop | Out-Null
    $Added.Add($Ip)
  } catch {
    if ($_.Exception.Message -match "already exists|Duplicate") {
      $warnings.Add("$Ip already present, skipped")
    } else {
      throw
    }
  }
}

# Kesfedilen alt agda BOS bir adres bulur (.100'den baslar), gateway'in
# kendisiyle (.1) ya da halihazirda arayuzde olan bir adresle CAKISMAZ.
function Find-FreeSecondaryIp([string]$SubnetPrefix, [string]$Avoid) {
  for ($i = 100; $i -le 250; $i++) {
    $candidate = "$SubnetPrefix$i"
    if ($candidate -eq $Avoid) { continue }
    $taken = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -IPAddress $candidate -ErrorAction SilentlyContinue
    if (-not $taken) { return $candidate }
  }
  throw "could not find a free secondary IP in ${SubnetPrefix}x"
}

# Bir alt agda BIZIM eklemis olabilecegimiz bir ikincil IP zaten var mi diye
# bakar (gateway'in kendisi HARIC). Varsa dokunmaz — yoksa Find-FreeSecondaryIp
# ile yeni bir bos yuva bulup ekler. Bunu ATLAMAK ust uste calistirmada her
# seferinde YENI bir IP (.100, sonra .101, sonra .102...) eklenmesine yol
# aciyordu — "bos yuva bul" ile "bu alt agda zaten bir IP'miz var mi" ayni
# soru degil, ikincisi olmadan idempotentlik BOZULUYOR.
function Ensure-SubnetSecondary([string]$SubnetPrefix, [string]$Avoid, [int]$PrefixLen, $Added) {
  $already = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress.StartsWith($SubnetPrefix) -and $_.IPAddress -ne $Avoid }
  if ($already) {
    $warnings.Add("subnet ${SubnetPrefix}x already has a secondary ($($already[0].IPAddress)), skipped")
    return
  }
  $candidate = Find-FreeSecondaryIp $SubnetPrefix $Avoid
  Ensure-SecondaryIp $candidate $PrefixLen $Added
}

# ADIM 1 — mevcut STATIK (elle atanmis) adresleri yedekle. DHCP'den gelen
# gecici bir kirayi ASLA yedeklemeyiz — bu, "makineye ozel baska IP'ler
# olabilir, onlar kaybolmasin" kuralinin ta kendisi. Hic olmayabilir de
# (bos liste), sayisi ONCEDEN SABIT VARSAYILMAZ.
$existingRaw = @(Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -eq "Manual" })
$backup = @($existingRaw | ForEach-Object { @{ IPAddress = $_.IPAddress; PrefixLength = $_.PrefixLength } })
Write-Progress2 ("backed up " + $backup.Count + " existing static address(es) on '" + $AdapterName + "'")

$discoveredIp = $null
$leaseAcquired = $false
$secondariesAdded = New-Object System.Collections.Generic.List[string]

try {
  # ADIM 2 — DHCP'ye gec (bugun canli dogrulanmis komut).
  #
  # NETSH TUHAFLIGI: adaptor zaten DHCP modundaysa netsh "DHCP is already
  # enabled on this interface." diyip exit code 1 DONUYOR — bu gercek bir
  # hata DEGIL, sadece "zaten oyleyim" demek. Exit code'a gore throw etmek
  # bunu FATAL SANIYORDU ve script hicbir sey yapmadan (statige geri
  # DONMEDEN) crash oluyordu — canli goruldu. Cikti metnine bakip sadece
  # GERCEKTEN beklenmeyen bir hata varsa dur.
  Write-Progress2 "switching '$AdapterName' to DHCP..."
  $netshOutput = (netsh interface ip set address name="$AdapterName" source=dhcp 2>&1 | Out-String).Trim()
  if ($netshOutput) { Write-Progress2 "netsh: $netshOutput" }
  if ($LASTEXITCODE -ne 0 -and $netshOutput -notmatch "already enabled") {
    throw "netsh source=dhcp failed with exit code ${LASTEXITCODE}: $netshOutput"
  }

  # ADIM 3 — kirayi bekle (169.254.* APIPA gercek kira SAYILMAZ).
  $deadline = (Get-Date).AddSeconds($DhcpTimeoutSec)
  $waited = 0
  while ((Get-Date) -lt $deadline) {
    $cfg = Get-NetIPConfiguration -InterfaceAlias $AdapterName -ErrorAction SilentlyContinue
    $gw = $null
    if ($cfg -and $cfg.IPv4DefaultGateway) { $gw = $cfg.IPv4DefaultGateway.NextHop }
    if ($gw -and -not $gw.StartsWith("169.254.")) {
      $discoveredIp = $gw
      break
    }
    Start-Sleep -Milliseconds 500
    $waited += 1
    if ($waited % 4 -eq 0) { Write-Progress2 ("waiting for lease (" + [int]($waited / 2) + "/" + $DhcpTimeoutSec + "s)...") }
  }
  $leaseAcquired = [bool]$discoveredIp
  if ($leaseAcquired) {
    Write-Progress2 "modem found at $discoveredIp"
  } else {
    Write-Progress2 "no DHCP lease within ${DhcpTimeoutSec}s (modem's DHCP is likely off) - falling back to known conventions"
  }

  # ADIM 4 — HER DURUMDA statige geri don, DHCP'den kalan gecici adresi at,
  # yedegi geri yukle.
  Write-Progress2 "switching '$AdapterName' back to static..."
  Set-NetIPInterface -InterfaceAlias $AdapterName -AddressFamily IPv4 -Dhcp Disabled -ErrorAction Stop
  Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -eq "Dhcp" } |
    ForEach-Object {
      try { Remove-NetIPAddress -InputObject $_ -Confirm:$false -ErrorAction Stop }
      catch { $warnings.Add("could not remove stale DHCP address $($_.IPAddress): $($_.Exception.Message)") }
    }

  foreach ($addr in $backup) {
    try {
      New-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $addr.IPAddress -PrefixLength $addr.PrefixLength `
        -ErrorAction Stop | Out-Null
    } catch {
      if ($_.Exception.Message -match "already exists|Duplicate") {
        $warnings.Add("restore: $($addr.IPAddress)/$($addr.PrefixLength) already present")
      } else {
        throw
      }
    }
  }

  # ADIM 5 — kesfedilen alt agda ikincil IP ekle (kira geldiyse). Alt agda
  # zaten bir ikincil varsa (onceki bir calistirmadan restore edilmis
  # olabilir) TEKRAR EKLEMEZ — idempotentlik icin sart.
  if ($leaseAcquired) {
    $subnetPrefix = (($discoveredIp -split '\.')[0..2] -join '.') + "."
    Ensure-SubnetSecondary $subnetPrefix $discoveredIp $PrefixLength $secondariesAdded
  }

  # ADIM 6 — HER ZAMAN 5.5.5.100'u de garanti et (provizyon sonu modem
  # oraya cekiliyor). Kesfedilen alt ag zaten 5.5.5.0/24 ise tekrar etme.
  $needsFieldSecondary = -not ($leaseAcquired -and $discoveredIp.StartsWith("5.5.5."))
  if ($needsFieldSecondary) {
    Ensure-SecondaryIp $FieldSecondaryIp $PrefixLength $secondariesAdded
  }

  # ADIM 7 — kira gelmediyse: bugunku ELLE kurulumun ayniyla devam (fabrika
  # + saha ikincil IP'leri). Bu bir HATA degil, guvenlik agi.
  if (-not $leaseAcquired) {
    Ensure-SecondaryIp "192.168.1.100" $PrefixLength $secondariesAdded
  }

  Write-ResultAndExit @{
    ok = $true
    adapter = $AdapterName
    leaseAcquired = $leaseAcquired
    discoveredHost = $discoveredIp
    fallbackUsed = -not $leaseAcquired
    secondariesAdded = @($secondariesAdded)
    restoredAddresses = $backup
    warnings = @($warnings)
    timestamp = (Get-Date).ToString("o")
  } 0

} catch {
  # Ne olursa olsun adaptoru YARIM birakma: statige don, yedegi geri yukle,
  # sonra hatayi bildir.
  $recoveryError = $null
  try {
    Set-NetIPInterface -InterfaceAlias $AdapterName -AddressFamily IPv4 -Dhcp Disabled -ErrorAction SilentlyContinue
    foreach ($addr in $backup) {
      try {
        New-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $addr.IPAddress -PrefixLength $addr.PrefixLength `
          -ErrorAction Stop | Out-Null
      } catch {}
    }
  } catch {
    $recoveryError = $_.Exception.Message
  }
  Write-ResultAndExit @{
    ok = $false; reason = "SEQUENCE_ERROR"; adapter = $AdapterName
    message = $_.Exception.Message
    recoveryAttempted = $true; recoveryError = $recoveryError
    restoredAddresses = $backup
  } 12
}
