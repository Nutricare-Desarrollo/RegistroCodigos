@echo off
chcp 65001 >nul
setlocal
title RegistroCodigos - subir cambios

rem ============================================================
rem  Commit + push de RegistroCodigos.
rem
rem  Uso:
rem    - Doble clic: pide el mensaje del commit y confirma antes de subir.
rem    - Consola:    subir-cambios.bat Codigos: ajuste del modal de confirmacion
rem
rem  El script se ejecuta SIEMPRE sobre la carpeta donde esta guardado,
rem  sin importar desde donde se abra.
rem
rem  OJO: al hacer push a la rama main, GitHub Actions despliega solo
rem  el sitio en Azure Static Web Apps. Los cambios de base de datos
rem  (scripts de database\) se siguen aplicando a mano con psql.
rem ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   RegistroCodigos  -  subir cambios a GitHub
echo ============================================================
echo.

rem ---------- 1. Requisitos ----------
where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro git en este equipo.
  echo         Instale Git para Windows: https://git-scm.com/download/win
  goto :fin
)

if not exist ".git" (
  echo [ERROR] Esta carpeta no es el repositorio ^(no existe la carpeta .git^).
  echo         Carpeta actual: %CD%
  echo         Guarde este script en la raiz del proyecto RegistroCodigos.
  goto :fin
)

rem ---------- 2. Candados sueltos de git ----------
rem Quedan cuando un proceso de git se corta a la mitad y bloquean
rem cualquier commit posterior con "Unable to create index.lock".
if exist ".git\index.lock" (
  echo [AVISO] Habia un .git\index.lock de una ejecucion anterior. Se elimina.
  del /q ".git\index.lock"
)
if exist ".git\HEAD.lock" (
  echo [AVISO] Habia un .git\HEAD.lock de una ejecucion anterior. Se elimina.
  del /q ".git\HEAD.lock"
)

rem ---------- 3. Rama y estado ----------
set RAMA=
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set RAMA=%%b
if "%RAMA%"=="" (
  echo [ERROR] No se pudo determinar la rama actual.
  goto :fin
)
echo Rama actual: %RAMA%
if not "%RAMA%"=="main" (
  echo [AVISO] No esta en main. El despliegue automatico solo corre desde main.
)
echo.
echo --- Cambios en el proyecto ---------------------------------
git status --short
echo -----------------------------------------------------------
echo.
echo Recuerde: las lineas que empiezan con ?? son archivos que NO estan
echo en el repositorio y este script NO los sube. Si alguno debe subirse,
echo agreguelo antes con:  git add ruta\del\archivo
echo.

rem ---------- 4. Commit (solo si hay cambios en archivos ya versionados) ----------
set HAYCAMBIOS=0
git diff --quiet
if errorlevel 1 set HAYCAMBIOS=1
git diff --cached --quiet
if errorlevel 1 set HAYCAMBIOS=1

if "%HAYCAMBIOS%"=="0" (
  echo No hay cambios nuevos que confirmar. Se revisa solo si falta subir commits.
  goto :push
)

set MSG=%*
if "%MSG%"=="" (
  echo Escriba el mensaje del commit ^(que se cambio, en una linea^).
  echo Ejemplo: Cargas: el modal de confirmacion se adapta a la accion
  set /p MSG=Mensaje:
)
if "%MSG%"=="" (
  echo [ERROR] Sin mensaje no se hace el commit.
  goto :fin
)

echo.
echo Agregando los archivos modificados...
git add -u
if errorlevel 1 (
  echo [ERROR] Fallo "git add".
  goto :fin
)

git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] Fallo el commit. Revise el mensaje de arriba.
  goto :fin
)
echo Commit creado.
echo.

:push
rem ---------- 5. Que falta subir ----------
echo Consultando GitHub...
git fetch origin --quiet
if errorlevel 1 (
  echo [AVISO] No se pudo consultar GitHub ^(sin red o sin credenciales^).
  echo         Se intenta el push de todas formas.
)
echo.
echo --- Commits pendientes de subir ---------------------------
git log --oneline origin/%RAMA%..%RAMA% 2>nul
echo -----------------------------------------------------------
echo.

rem ---------- 6. Confirmar y subir ----------
set RESP=
set /p RESP=Subir estos commits a GitHub y desplegar? (S/N):
if /i "%RESP%"=="S"  goto :hacerpush
if /i "%RESP%"=="SI" goto :hacerpush
echo Cancelado. Los commits quedan guardados en el equipo, sin subir.
goto :fin

:hacerpush
echo.
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
  echo La rama no tenia seguimiento en el remoto: se configura con -u.
  git push -u origin %RAMA%
) else (
  git push
)
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo el push.
  echo   - Si pide usuario y clave: use su cuenta de GitHub con un token
  echo     personal ^(Settings ^> Developer settings ^> Personal access tokens^).
  echo   - Si dice "rejected / non-fast-forward": alguien mas subio cambios.
  echo     Corra primero:  git pull --rebase origin %RAMA%
  goto :fin
)

echo.
echo ============================================================
echo   Listo. Cambios subidos.
echo   El despliegue arranca solo. Puede seguirlo en:
echo   https://github.com/Nutricare-Desarrollo/RegistroCodigos/actions
echo ============================================================

:fin
echo.
pause
endlocal
