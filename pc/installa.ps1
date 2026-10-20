# Registra scarica_mimit.ps1 nell'Utilita di pianificazione: ogni giorno alle 12.
# Se a quell'ora il computer e spento, parte appena viene acceso.
$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "scarica_mimit.ps1"
$azione = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$quando = New-ScheduledTaskTrigger -Daily -At 12:00
$opzioni = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Distributori - prezzi MIMIT" -Action $azione -Trigger $quando -Settings $opzioni -Force | Out-Null
Write-Host "Fatto: ogni giorno alle 12 il computer scarica i prezzi del MIMIT per il sito."
