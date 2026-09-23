export default function PrivacyPage() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", lineHeight: 1.6 }}>
      <h1>Informativa sulla privacy</h1>
      <p style={{ color: "#666" }}>Ultimo aggiornamento: {new Date().toLocaleDateString("it-IT")}</p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        GENESIVOX S.r.l. è il titolare del trattamento dei dati personali raccolti tramite questa piattaforma.
        Per qualsiasi richiesta relativa ai tuoi dati puoi scrivere a{" "}
        <a href="mailto:info@genesivox.com">info@genesivox.com</a>.
      </p>

      <h2>2. Quali dati raccogliamo</h2>
      <p>Nell'uso ordinario della piattaforma raccogliamo:</p>
      <ul>
        <li>Dati identificativi dell'account: nome, cognome, email, nome azienda, attività svolta.</li>
        <li>
          Documenti caricati per la gestione della sicurezza del cantiere (es. nomine, idoneità, attestati,
          preventivi), che possono contenere dati relativi alla salute (es. idoneità sanitaria alla mansione).
        </li>
        <li>Dati di presenza in cantiere: data, ora di ingresso e uscita, cantiere di riferimento.</li>
        <li>Dati tecnici minimi necessari al funzionamento (es. sessione di accesso).</li>
      </ul>

      <h2>3. Finalità del trattamento</h2>
      <p>I dati sono trattati per le seguenti finalità:</p>
      <ul>
        <li>Gestione della documentazione di sicurezza dei cantieri, in adempimento del D.Lgs. 81/2008.</li>
        <li>Gestione degli accessi e delle presenze in cantiere.</li>
        <li>Comunicazioni relative all'account e al servizio (es. approvazioni, notifiche).</li>
        <li>Adempimento di obblighi di legge in materia di sicurezza sul lavoro.</li>
      </ul>

      <h2>4. Base giuridica</h2>
      <p>
        Il trattamento si fonda sull'esecuzione del contratto di servizio con l'impresa/utente, sull'adempimento di
        obblighi di legge (in particolare il D.Lgs. 81/2008 in materia di sicurezza sui luoghi di lavoro) e, quando
        applicabile, sul consenso esplicito per i dati relativi alla salute.
      </p>

      <h2>5. Conservazione dei dati</h2>
      <p>
        I dati sono conservati per il tempo necessario alle finalità sopra indicate e comunque nel rispetto dei
        termini previsti dalla normativa in materia di sicurezza sul lavoro e conservazione documentale.
      </p>

      <h2>6. Come proteggiamo i tuoi dati</h2>
      <p>Adottiamo misure tecniche per proteggere i dati caricati sulla piattaforma, tra cui:</p>
      <ul>
        <li>Accesso ai dati riservato solo alle persone autorizzate per ciascun cantiere.</li>
        <li>Connessione cifrata (HTTPS) tra il tuo dispositivo e i nostri sistemi.</li>
        <li>Controllo antivirus automatico sui file caricati.</li>
        <li>Backup regolari dei dati.</li>
      </ul>

      <h2>7. I tuoi diritti</h2>
      <p>
        In qualsiasi momento puoi richiedere l'accesso ai tuoi dati, la loro rettifica, cancellazione, o opporti al
        trattamento, scrivendo a <a href="mailto:info@genesivox.com">info@genesivox.com</a>. Risponderemo alla tua
        richiesta nei tempi previsti dalla normativa vigente.
      </p>

      <h2>8. Cookie</h2>
      <p>
        La piattaforma utilizza esclusivamente cookie tecnici necessari a mantenere la sessione di accesso. Non
        utilizziamo cookie di profilazione o di marketing.
      </p>

      <h2>9. Modifiche a questa informativa</h2>
      <p>
        Questa informativa può essere aggiornata nel tempo. La data di ultimo aggiornamento è indicata in cima alla
        pagina.
      </p>
    </div>
  );
}
