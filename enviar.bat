@echo off
cd C:\projetoauditoria
echo Adicionando alteracoes...
git add .
echo Salvando alteracoes...
git commit -m "Atualizacao automatica: %date% %time%"
echo Enviando para a nuvem...
git push origin Master
echo Pronto! Pagina atualizada.
pause