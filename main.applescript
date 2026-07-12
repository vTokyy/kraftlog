-- Kraftlog-Launcher: öffnet die lokale index.html im Standardbrowser.
-- Neu kompilieren (falls nötig):
--   osacompile -o ~/Desktop/Kraftlog.app main.applescript
set appPath to POSIX path of (path to me)
set htmlPath to appPath & "Contents/Resources/app/index.html"
do shell script "open " & quoted form of htmlPath
