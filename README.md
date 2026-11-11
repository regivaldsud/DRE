# DRE · Dimensionamento de Redes de Esgoto

Aplicativo desktop para estimar dimensões e quantitativos de fossas sépticas, filtros anaeróbios, sumidouros e caixas de gordura. A aba Projeto reúne as vistas 3D, em planta e em corte, além do esquema de empuxo no sumidouro. O Memorial compara as dimensões mínimas calculadas com as adotadas.

## Executar o código-fonte

Com Node.js e npm instalados, abra o PowerShell na raiz do repositório:

```powershell
Set-Location 'Dimensionamento de Fossa 6.0/resources/app'
npm test
npx --yes electron@31.7.7 .
```

O Three.js já está incluído no código. Sua licença acompanha a biblioteca em `resources/app/js/vendor`.

## Gerar o instalador para Windows x64

1. Extraia a distribuição oficial **Electron 31.7.7 para Windows x64** na pasta `Dimensionamento de Fossa 6.0`, preservando os arquivos do repositório em `resources/app`.
2. Renomeie `electron.exe` para `Dimensionamento de Fossa 6.0.exe`. Esse nome é usado pelo instalador para atualizar instalações existentes.
3. Execute `./instalador/Gerar-Instalador.ps1` na raiz do repositório. O script usa o compilador do .NET Framework do Windows e gera um instalador gráfico com os arquivos do aplicativo incluídos.

Os desenhos são esquemáticos. Os valores de momento e cortante podem ser informados a partir do modelo estrutural do projeto.
