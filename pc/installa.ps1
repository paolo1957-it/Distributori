# Registra scarica_mimit.ps1 nell'Utilita di pianificazione: ogni giorno alle 12.
# Se a quell'ora il computer e spento, parte appena viene acceso.
# L'esito finisce anche in registro.txt, perche la finestra si chiude da sola.
$cartella = Split-Path -Parent $MyInvocation.MyCommand.Path
$registro = Join-Path $cartella "registro.txt"
function Scrivi($testo) {
    $riga = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $testo
    Write-Host $riga
    Add-Content -Path $registro -Value $riga -Encoding UTF8
}
try {
    $script = Join-Path $cartella "scarica_mimit.ps1"
    $azione = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    $quando = New-ScheduledTaskTrigger -Daily -At 12:00
    $opzioni = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskName "Distributori - prezzi MIMIT" -Action $azione -Trigger $quando -Settings $opzioni -Force -ErrorAction Stop | Out-Null
    $t = Get-ScheduledTask -TaskName "Distributori - prezzi MIMIT" -ErrorAction Stop
    $prossima = (Get-ScheduledTaskInfo -TaskName "Distributori - prezzi MIMIT").NextRunTime
    Scrivi "INSTALLAZIONE OK: operazione pianificata registrata (stato $($t.State), prossima esecuzione $prossima)."
} catch {
    Scrivi "INSTALLAZIONE FALLITA: $($_.Exception.Message)"
}
Read-Host "Premi Invio per chiudere"
