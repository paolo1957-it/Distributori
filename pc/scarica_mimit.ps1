# Distributori - piano B dal computer di paolo.
# Ogni giorno alle 12 (Utilita di pianificazione, vedi installa.ps1):
#  1. guarda la data dei dati pubblicati sul sito;
#  2. se il MIMIT ha un'estrazione piu recente, scarica i due CSV;
#  3. li carica sulla release "dati-mimit" del repository (non sono commit);
#  4. fa partire il workflow pubblica.yml, che li elabora e pubblica il sito.
# Il token GitHub sta in token.txt nella stessa cartella (mai nel repository).

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo     = "paolo1957-it/distributori"
$Sito     = "https://paolo1957-it.github.io/distributori/dati/indice.json"
$Mimit    = "https://www.mimit.gov.it/images/exportCSV/"
$File     = @("anagrafica_impianti_attivi.csv", "prezzo_alle_8.csv")
$Tag      = "dati-mimit"
$Cartella = Split-Path -Parent $MyInvocation.MyCommand.Path
$Registro = Join-Path $Cartella "registro.txt"
$Browser  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
$Passo    = "avvio"

function Scrivi($testo) {
    $riga = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $testo
    Write-Host $riga
    Add-Content -Path $Registro -Value $riga -Encoding UTF8
}

try {
    $Passo = "lettura di token.txt"
    $token = (Get-Content (Join-Path $Cartella "token.txt") -Raw).Trim()
    $gh = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json"; "User-Agent" = "distributori-pc" }

    # 1. data dei dati gia pubblicati
    $sulSito = ""
    try { $sulSito = (Invoke-RestMethod -Uri $Sito -UseBasicParsing -TimeoutSec 60).estrazione } catch { }

    # 2. scarico i CSV dal MIMIT
    $Passo = "download dal MIMIT"
    $tmp = Join-Path $env:TEMP "distributori-mimit"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    foreach ($f in $File) {
        Invoke-WebRequest -Uri ($Mimit + $f) -OutFile (Join-Path $tmp $f) -UseBasicParsing -TimeoutSec 300 -UserAgent $Browser
    }
    $prima = Get-Content (Join-Path $tmp "prezzo_alle_8.csv") -TotalCount 1
    if ($prima -notmatch "(\d{4}-\d{2}-\d{2})") { throw "file del MIMIT senza data: $prima" }
    $estrazione = $Matches[1]
    if ($sulSito -and $estrazione -le $sulSito) {
        Scrivi "Sito gia aggiornato (sito $sulSito, MIMIT $estrazione): niente da fare."
        exit 0
    }

    # 3. release "dati-mimit": la creo la prima volta, poi sostituisco i file
    $Passo = "lettura della release su GitHub (controlla il token)"
    try {
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $gh
    } catch {
        $Passo = "creazione della release su GitHub (al token serve Contents: Read and write)"
        $corpo = @{ tag_name = $Tag; name = "Dati MIMIT dal computer"; body = "Copia dei CSV del MIMIT caricata da pc/scarica_mimit.ps1."; prerelease = $true } | ConvertTo-Json
        $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/releases" -Headers $gh -Body $corpo -ContentType "application/json"
    }
    $Passo = "caricamento dei file su GitHub (al token serve Contents: Read and write)"
    foreach ($a in $rel.assets) {
        if ($File -contains $a.name) {
            Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$Repo/releases/assets/$($a.id)" -Headers $gh | Out-Null
        }
    }
    foreach ($f in $File) {
        $url = "https://uploads.github.com/repos/$Repo/releases/$($rel.id)/assets?name=$f"
        Invoke-RestMethod -Method Post -Uri $url -Headers $gh -InFile (Join-Path $tmp $f) -ContentType "text/csv" | Out-Null
    }

    # 4. faccio ripartire la pubblicazione
    $Passo = "avvio del workflow (al token serve Actions: Read and write)"
    $corpo = @{ ref = "main" } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/actions/workflows/pubblica.yml/dispatches" -Headers $gh -Body $corpo -ContentType "application/json" | Out-Null

    Scrivi "Caricati i CSV del MIMIT (estrazione $estrazione, sul sito c'era $sulSito) e avviata la pubblicazione."
} catch {
    Scrivi "ERRORE durante $($Passo): $($_.Exception.Message)"
    exit 1
}
