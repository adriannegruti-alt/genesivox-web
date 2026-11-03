// BOZZA da far rivedere dal consulente legale prima della pubblicazione definitiva.
// Compila i campi qui sotto con i dati ufficiali della società.
const SEDE_LEGALE = "San Donà di Piave";
const PARTITA_IVA = "";
const FORO = "Venezia";

export default function TerminiPage() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", lineHeight: 1.6 }}>
      <h1>Termini di utilizzo</h1>
      <p style={{ color: "#666" }}>Ultimo aggiornamento: 3 novembre 2026</p>

      <h2>1. Chi siamo e a cosa servono questi termini</h2>
      <p>
        Il servizio GENESIVOX (&quot;il Servizio&quot;) è fornito da GENESIVOX S.r.l., {SEDE_LEGALE}, P. IVA {PARTITA_IVA}
        (&quot;GENESIVOX&quot;). Questi Termini regolano l&apos;uso del Servizio da parte di chi attiva un account
        (&quot;l&apos;Utente&quot;), che può essere un&apos;impresa, un committente, un professionista, un lavoratore o
        un&apos;autorità di controllo. L&apos;attivazione dell&apos;account implica la lettura e l&apos;accettazione di questi
        Termini e dell&apos;<a href="/privacy">Informativa privacy</a>.
      </p>

      <h2>2. Il Servizio</h2>
      <p>
        GENESIVOX è una piattaforma web per organizzare i documenti di sicurezza dei cantieri, registrare le presenze con
        QR-code e ricevere avvisi sulle scadenze. Le funzioni disponibili sono quelle presenti nell&apos;applicazione al
        momento dell&apos;uso. Il Servizio è un <strong>supporto alla gestione</strong>: non sostituisce gli obblighi
        previsti dalla legge (in particolare dal D.Lgs. 81/2008) né le valutazioni e le decisioni del datore di lavoro,
        del committente, del coordinatore per la sicurezza, dell&apos;RSPP e degli altri soggetti responsabili. Quali
        documenti richiedere in un cantiere resta una scelta di questi soggetti.
      </p>

      <h2>3. Account e credenziali</h2>
      <ul>
        <li>L&apos;account è personale. L&apos;Utente accede con la propria email e la propria password.</li>
        <li>
          L&apos;Utente custodisce con cura la password, non la comunica ad altri e non usa le credenziali altrui. Se
          sospetta un accesso non autorizzato, avvisa subito GENESIVOX a info@genesivox.com.
        </li>
        <li>L&apos;Utente è responsabile delle attività svolte con il proprio account.</li>
        <li>
          L&apos;impresa che dà accesso a propri dipendenti o collaboratori li autorizza e li istruisce a usare il Servizio
          in modo corretto e riservato.
        </li>
        <li>
          Le richieste di account di imprese, committenti e professionisti sono soggette ad approvazione da parte di
          GENESIVOX. L&apos;email indicata in fase di registrazione è l&apos;indirizzo a cui inviamo le comunicazioni relative
          al Servizio, che si considerano ricevute. L&apos;Utente ci comunica ogni variazione dell&apos;email.
        </li>
      </ul>

      <h2>4. Prova gratuita, abbonamento e pagamenti</h2>
      <p>
        Può essere offerta una prova gratuita di 30 giorni, con eventuale assistenza nell&apos;attivazione dell&apos;account e
        dei primi cantieri. Al termine della prova, per continuare a usare tutte le funzioni è necessario un abbonamento,
        mensile senza vincolo di durata oppure annuale. Prezzi, modalità di fatturazione e di pagamento sono comunicati
        all&apos;Utente prima dell&apos;attivazione dell&apos;abbonamento. L&apos;account da lavoratore è gratuito. Alla scadenza
        della prova, senza abbonamento, alcune funzioni possono essere limitate (ad esempio la creazione di nuovi
        cantieri); i dati già caricati restano disponibili secondo quanto previsto dall&apos;articolo 11.
      </p>

      <h2>5. Uso corretto del Servizio</h2>
      <p>L&apos;Utente si impegna a:</p>
      <ul>
        <li>usare il Servizio solo per le finalità per cui è pensato e nel rispetto della legge;</li>
        <li>non aggirare le protezioni del Servizio, non alterarlo e non tentare di accedere ai dati di altri;</li>
        <li>non creare cantieri inesistenti né modificarne arbitrariamente lo stato;</li>
        <li>
          non inserire contenuti offensivi, minacciosi, discriminatori, illeciti o diffamatori, né file contenenti virus o
          segreti professionali o industriali altrui;
        </li>
        <li>comportarsi con correttezza nelle comunicazioni con gli altri utenti.</li>
      </ul>

      <h2>6. Contenuti caricati e responsabilità dell&apos;Utente</h2>
      <p>
        L&apos;Utente è responsabile dei documenti e dei dati che carica: deve caricare solo informazioni corrispondenti al
        vero, tenerle aggiornate e segnalare quelle inesatte. L&apos;Utente garantisce di avere il diritto di caricare i
        documenti e, se riguardano altre persone (ad esempio i propri lavoratori), di aver adempiuto agli obblighi di
        informazione previsti dalla normativa sulla protezione dei dati. L&apos;Utente conserva anche, per proprio conto,
        copia dei documenti importanti, senza dipendere solo dal Servizio.
      </p>

      <h2>7. Dati personali</h2>
      <p>
        Il trattamento dei dati personali è descritto nell&apos;<a href="/privacy">Informativa privacy</a>. GENESIVOX non
        esegue controlli preventivi sul contenuto dei documenti caricati.
      </p>

      <h2>8. Assistenza e manutenzione</h2>
      <p>
        GENESIVOX svolge la manutenzione del Servizio (correzione degli errori tecnici, adeguamenti e miglioramenti) e
        offre assistenza tramite info@genesivox.com. L&apos;assistenza riguarda l&apos;uso delle funzioni del Servizio. Non
        sono garantiti tempi di presa in carico o di risoluzione. La manutenzione non comprende l&apos;hardware, i programmi
        e i dispositivi dell&apos;Utente.
      </p>

      <h2>9. Limiti di responsabilità</h2>
      <p>
        GENESIVOX si impegna a fornire il Servizio con diligenza, ma non può garantire che sia sempre disponibile o privo di
        errori: possono verificarsi interruzioni dovute, ad esempio, a problemi di rete, ai fornitori di servizi
        informatici o a interventi di manutenzione. Nei limiti consentiti dalla legge, GENESIVOX non risponde dei danni
        derivanti da interruzioni o malfunzionamenti del Servizio, da dati inseriti dall&apos;Utente o da altri utenti non
        corretti o non aggiornati, da scadenze non rispettate o da avvisi non ricevuti (ad esempio per email non
        recapitate o notifiche disattivate sul dispositivo). GENESIVOX non garantisce l&apos;assoluta immunità da accessi non
        autorizzati o da perdita di dati, né il raggiungimento di specifici risultati. Restano ferme le responsabilità che
        la legge non consente di escludere.
      </p>

      <h2>10. Sospensione dell&apos;account</h2>
      <p>
        In caso di violazione di questi Termini, GENESIVOX può contestarla all&apos;Utente assegnandogli un termine per
        rispondere e per rimediare. Se la violazione continua o si ripete, o in caso di rischio per la sicurezza del
        Servizio, GENESIVOX può sospendere o chiudere l&apos;account, anche senza preavviso nei casi più gravi.
      </p>

      <h2>11. Recesso e cessazione</h2>
      <p>
        L&apos;Utente può chiedere in qualsiasi momento la cancellazione dell&apos;account scrivendo a info@genesivox.com. Per
        l&apos;abbonamento mensile non ci sono vincoli di durata; per quello annuale valgono le condizioni comunicate al
        momento dell&apos;acquisto. Dopo la cancellazione, l&apos;Utente non ha più accesso ai propri dati; i dati sono
        conservati o cancellati secondo quanto indicato nell&apos;Informativa privacy e nei limiti degli obblighi di legge.
        Prima della cancellazione l&apos;Utente è invitato a scaricare o conservare copia dei documenti che gli servono.
        GENESIVOX può cessare o modificare il Servizio dandone comunicazione agli Utenti con un preavviso ragionevole.
      </p>

      <h2>12. Legge applicabile e foro competente</h2>
      <p>
        Questi Termini sono regolati dalla legge italiana. Per ogni controversia è competente il foro di {FORO}, salvo
        diversa disposizione inderogabile di legge. Prima di agire in giudizio le parti si impegnano a tentare una
        conciliazione presso un organismo di mediazione abilitato.
      </p>

      <h2>13. Proprietà intellettuale</h2>
      <p>
        Il software, la grafica e i contenuti del Servizio sono di GENESIVOX. All&apos;Utente è concesso il solo diritto di
        usare il Servizio, per la durata dell&apos;account e secondo questi Termini. I documenti caricati restano
        dell&apos;Utente.
      </p>

      <h2>14. Modifiche e contatti</h2>
      <p>
        GENESIVOX può aggiornare questi Termini; la data di ultimo aggiornamento è indicata in cima alla pagina e, per le
        modifiche importanti, avvisiamo gli Utenti via email. Per qualsiasi domanda scrivi a{" "}
        <a href="mailto:info@genesivox.com">info@genesivox.com</a>.
      </p>
    </div>
  );
}
