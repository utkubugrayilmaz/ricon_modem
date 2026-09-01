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

# Prefix uzunlugunu (24) noktali maskeye (255.255.255.0) cevirir — netsh
# "static" alt komutu PrefixLength degil dotted mask ister.
function ConvertTo-Mask([int]$PrefixLen) {
  $bits = ("1" * $PrefixLen).PadRight(32, "0")
  $octets = for ($i = 0; $i -lt 32; $i += 8) { [Convert]::ToInt32($bits.Substring($i, 8), 2) }
  return ($octets -join ".")
}

# Kesfedilen alt agda, $DesiredList'te henuz OLMAYAN bos bir adres bulur
# (.100'den baslar), gateway'in kendisiyle (.1) cakismaz. Canli (henuz
# uygulanmamis) durumu Get-NetIPAddress ile degil, $DesiredList ile
# kontrol eder — bu asamada adaptor hala DHCP modunda, live sorgu yaniltir.
function Find-FreeSecondaryIp([string]$SubnetPrefix, [string]$Avoid, $DesiredList) {
  for ($i = 100; $i -le 250; $i++) {
    $candidate = "$SubnetPrefix$i"
    if ($candidate -eq $Avoid) { continue }
    if ($DesiredList | Where-Object { $_.IPAddress -eq $candidate }) { continue }
    return $candidate
  }
  throw "could not find a free secondary IP in ${SubnetPrefix}x"
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

  # ADIM 4 — hedef son durumu ONCEDEN (bellekte) hesapla: yedek + gerekiyorsa
  # kesfedilen alt agda bir ikincil + HER ZAMAN 5.5.5.100 + (kira gelmediyse)
  # 192.168.1.100. Statik "Manual" olarak eklenecek TUM adresler burada.
  #
  # Set-NetIPInterface -Dhcp Disabled canli olarak "Inconsistent parameters
  # PolicyStore PersistentStore and Dhcp Enabled" hatasi verdi (bilinen bir
  # PowerShell NetTCPIP kusuru, -PolicyStore ActiveStore ile de duzelmedi).
  # Onun yerine DHCP'ye gecerken KANITLANMIS olan netsh'i statige donerken
  # de kullaniyoruz: netsh'in "static" alt komutu DHCP'yi kapatmakla ilk
  # adresi atamayi TEK adimda yapar, guvenilir.
  $desired = @()
  foreach ($b in $backup) { $desired += @{ IPAddress = $b.IPAddress; PrefixLength = $b.PrefixLength; IsNew = $false } }

  if ($leaseAcquired) {
    $subnetPrefix = (($discoveredIp -split '\.')[0..2] -join '.') + "."
    $hasSubnetSecondary = [bool]($desired | Where-Object { $_.IPAddress.StartsWith($subnetPrefix) -and $_.IPAddress -ne $discoveredIp })
    if (-not $hasSubnetSecondary) {
      $candidate = Find-FreeSecondaryIp $subnetPrefix $discoveredIp $desired
      $desired += @{ IPAddress = $candidate; PrefixLength = $PrefixLength; IsNew = $true }
    }
  }
  $hasFieldSecondary = [bool]($desired | Where-Object { $_.IPAddress -eq $FieldSecondaryIp })
  if (-not $hasFieldSecondary) {
    $desired += @{ IPAddress = $FieldSecondaryIp; PrefixLength = $PrefixLength; IsNew = $true }
  }
  if (-not $leaseAcquired) {
    $hasFactoryFallback = [bool]($desired | Where-Object { $_.IPAddress -eq "192.168.1.100" })
    if (-not $hasFactoryFallback) {
      $desired += @{ IPAddress = "192.168.1.100"; PrefixLength = $PrefixLength; IsNew = $true }
    }
  }

  # ADIM 5 — netsh ile DHCP'yi kapat + $desired'in ILKINI ata (tek adimda).
  Write-Progress2 "switching '$AdapterName' back to static..."
  $primary = $desired[0]
  $primaryMask = ConvertTo-Mask $primary.PrefixLength
  $netshStaticOutput = (netsh interface ip set address name="$AdapterName" static $($primary.IPAddress) $primaryMask 2>&1 | Out-String).Trim()
  if ($netshStaticOutput) { Write-Progress2 "netsh: $netshStaticOutput" }
  if ($LASTEXITCODE -ne 0) {
    throw "netsh static set failed with exit code ${LASTEXITCODE}: $netshStaticOutput"
  }
  if ($primary.IsNew) { $secondariesAdded.Add($primary.IPAddress) }

  # ADIM 6 — geri kalanini New-NetIPAddress ile ekle (idempotent: zaten
  # varsa hata SAYMAZ).
  for ($i = 1; $i -lt $desired.Count; $i++) {
    $item = $desired[$i]
    if ($item.IsNew) {
      Ensure-SecondaryIp $item.IPAddress $item.PrefixLength $secondariesAdded
    } else {
      try {
        New-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $item.IPAddress -PrefixLength $item.PrefixLength `
          -ErrorAction Stop | Out-Null
      } catch {
        if ($_.Exception.Message -match "already exists|Duplicate") {
          $warnings.Add("restore: $($item.IPAddress)/$($item.PrefixLength) already present")
        } else {
          throw
        }
      }
    }
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
    if ($backup.Count -gt 0) {
      # netsh "static" DHCP'yi kapatir + ilk yedegi tek adimda atar (bkz.
      # ADIM 5 — Set-NetIPInterface burada da GUVENILMEZ).
      $first = $backup[0]
      $firstMask = ConvertTo-Mask $first.PrefixLength
      netsh interface ip set address name="$AdapterName" static $($first.IPAddress) $firstMask 2>&1 | Out-Null
      for ($i = 1; $i -lt $backup.Count; $i++) {
        try {
          New-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $backup[$i].IPAddress -PrefixLength $backup[$i].PrefixLength `
            -ErrorAction Stop | Out-Null
        } catch {}
      }
    }
    # Yedek YOKTU: adaptoru zorla statige cekmenin elimizde verecek gercek
    # bir adresi yok, DHCP modunda birakmak APIPA'ya dusse bile netsh'in
    # ihtiyac duydugu bir adres uydurmaktan daha guvenli.
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
