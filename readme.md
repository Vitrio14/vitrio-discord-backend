# VitrioTTV Discord Backend (Versione Base)

Backend Proxy per gestire:
- Login Discord
- Fetch dati utente
- Ruoli nel server Discord

## Variabili Ambiente (Render)
- BOT_TOKEN = <inserisci bot token>
- PORT = 10000

## Avvio Manuale
npm install  
npm start

## Endpoint Disponibili

### GET /getUserInfo?userId=ID
Ritorna:
- username
- avatar
- global name
- data creazione account
- ruoli del server
- data join guild
