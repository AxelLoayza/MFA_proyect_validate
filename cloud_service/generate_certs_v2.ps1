# Generate Self-Signed TLS Certificates using PFX
# Compatible with Windows PowerShell 5.1

Write-Host "Generating TLS certificates for cloud_service..." -ForegroundColor Cyan

$certsPath = "$PSScriptRoot\certs"
$pfxFile = "$certsPath\server.pfx"
$certFile = "$certsPath\server.crt"
$keyFile = "$certsPath\server.key"
$password = "bmfa-cloud"

# Create directory
if (-not (Test-Path $certsPath)) {
    New-Item -ItemType Directory -Path $certsPath | Out-Null
}

# Clean existing files
Remove-Item "$certsPath\*" -Force -ErrorAction SilentlyContinue

# Certificate parameters
$params = @{
    Subject = "CN=localhost"
    DnsName = @("localhost", "127.0.0.1", "::1")
    KeyAlgorithm = "RSA"
    KeyLength = 2048
    NotAfter = (Get-Date).AddYears(2)
    CertStoreLocation = "Cert:\CurrentUser\My"
    KeyUsage = "DigitalSignature", "KeyEncipherment"
    Type = "SSLServerAuthentication"
}

try {
    Write-Host "Step 1: Creating certificate..."
    $cert = New-SelfSignedCertificate @params
    $thumbprint = $cert.Thumbprint
    Write-Host "  Thumbprint: $thumbprint" -ForegroundColor Green
    
    Write-Host "Step 2: Exporting to PFX..."
    $pwd = ConvertTo-SecureString -String $password -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $pwd | Out-Null
    Write-Host "  PFX created: $pfxFile" -ForegroundColor Green
    
    Write-Host "Step 3: Exporting certificate (CRT)..."
    $certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $certPem = "-----BEGIN CERTIFICATE-----`n"
    $certPem += [Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
    $certPem += "`n-----END CERTIFICATE-----`n"
    Set-Content -Path $certFile -Value $certPem -Encoding ASCII
    Write-Host "  CRT created: $certFile" -ForegroundColor Green
    
    Write-Host "Step 4: Extracting private key..."
    # For Python/Uvicorn, we can use the PFX file directly or extract the key
    # Since ExportRSAPrivateKey is not available, we'll create a note file
    $noteContent = @"
NOTA: Para usar estos certificados con Python/Uvicorn:

OPCION 1 - Usar PFX directamente (Recomendado):
   No es compatible con uvicorn directamente.

OPCION 2 - Convertir PFX a PEM con OpenSSL:
   openssl pkcs12 -in server.pfx -out server.key -nocerts -nodes
   openssl pkcs12 -in server.pfx -out server.crt -clcerts -nokeys

OPCION 3 - Usar certificados de desarrollo de uvicorn:
   uvicorn app.main:app --ssl-keyfile=./certs/server.key --ssl-certfile=./certs/server.crt

Password del PFX: $password

MIENTRAS TANTO: Usa HTTP para desarrollo (TLS_ENABLED=false en .env)
"@
    Set-Content -Path "$certsPath\README.txt" -Value $noteContent -Encoding UTF8
    
    # Create a placeholder key file
    $keyNote = @"
# Private Key Placeholder
# 
# Este archivo es un placeholder. Para extraer la clave privada real del PFX:
#
# Instala OpenSSL y ejecuta:
#   openssl pkcs12 -in server.pfx -out server.key -nocerts -nodes -password pass:$password
#
# O usa el modo HTTP para desarrollo (TLS_ENABLED=false en .env)
"@
    Set-Content -Path $keyFile -Value $keyNote -Encoding UTF8
    Write-Host "  Key placeholder created: $keyFile" -ForegroundColor Yellow
    Write-Host "  Instructions: $certsPath\README.txt" -ForegroundColor Yellow
    
    Write-Host "Step 5: Cleanup..."
    Remove-Item -Path "Cert:\CurrentUser\My\$thumbprint" -Force
    
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Certificates generated successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nFiles created:" -ForegroundColor Cyan
    Write-Host "  - $pfxFile (PFX with private key)" -ForegroundColor White
    Write-Host "  - $certFile (Public certificate PEM)" -ForegroundColor White
    Write-Host "  - $keyFile (Placeholder - see README)" -ForegroundColor Yellow
    Write-Host "  - $certsPath\README.txt (Instructions)" -ForegroundColor White
    Write-Host "`nRECOMMENDATION:" -ForegroundColor Yellow
    Write-Host "  For easy development, set TLS_ENABLED=false in .env" -ForegroundColor Yellow
    Write-Host "  This allows HTTP testing without certificate issues" -ForegroundColor Yellow
    Write-Host "`n"
    
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
    exit 1
}
