/**
 * Knowledge Base Data — Corrective Actions
 * Source: GP HR Procedures & Policy v3.0 (02.01.26)
 *
 * Structure: Array of articles, each with id, title, category, tags, keywords, content (HTML).
 * AI-ready: content chunked into logical sections with metadata for future LLM integration.
 */

// eslint-disable-next-line no-unused-vars
const CA_KB_ARTICLES = [

  // ============================================================
  // CATEGORY: Violation Catalog
  // ============================================================
  {
    id: 'cat1',
    title: '1. Basic Discipline',
    category: 'Violation Catalog',
    tags: ['dress code', 'food', 'sleeping', 'protocol', 'mandatory courses'],
    keywords: ['dress code', 'food', 'beverage', 'sleeping', 'nap', 'carelessness', 'protocol', 'mandatory courses', 'restroom', 'basic discipline'],
    content: `
      <h4>Category 1: Misconduct — Basic Discipline</h4>
      <p class="kb-source">HR Policy v3.0, Pages 8–9</p>
      <h5>1.1 Protocol Violations</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>1.1.1</td><td>Failure to wear prescribed dress code or violation of Dress Code Guidelines</td><td>CAP 0</td></tr>
          <tr><td>1.1.2</td><td>Drinking from non-spill proof beverage vessel at workstations</td><td>CAP 0</td></tr>
          <tr><td>1.1.3</td><td>Bringing/eating food inside production floor without proper approval</td><td>CAP 0</td></tr>
          <tr><td>1.1.4</td><td>Violation of I&amp;L Food Policy</td><td>CAP 0</td></tr>
          <tr><td>1.1.5</td><td>Violation of I&amp;L Restroom Usage Policy</td><td>CAP 0</td></tr>
          <tr><td>1.1.6</td><td>Violation of I&amp;L Power Nap Room Policy</td><td>CAP 0</td></tr>
          <tr><td>1.1.7</td><td>Non completion of mandatory courses within required timeline</td><td>CAP 1</td></tr>
          <tr><td>1.1.8</td><td>Sleeping in workstation, non-designated areas</td><td>CAP 1</td></tr>
          <tr><td>1.1.9</td><td>Mistakes or omissions due to carelessness with potential/unrealized impact</td><td>CAP 1</td></tr>
          <tr><td>1.1.10</td><td>Any minor violation analogous to the foregoing</td><td>CAP 1</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'cat2',
    title: '2. Facilities & Workplace Standards',
    category: 'Violation Catalog',
    tags: ['safety', 'security', 'drugs', 'alcohol', 'ID card', 'weapons', 'sanitation'],
    keywords: ['safety', 'security', 'sanitation', 'ID card', 'tailgating', 'drugs', 'alcohol', 'weapons', 'firearms', 'vandalism', 'facilities', 'workplace standards', 'loitering'],
    content: `
      <h4>Category 2: Misconduct — On Facilities and Workplace Standards</h4>
      <p class="kb-source">HR Policy v3.0, Pages 9–11</p>
      <h5>2.1 Violations against Safety, Security, Sanitation and Order</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>2.1.1</td><td>Failure to wear proximity/ID Card within office premises</td><td>CAP 1</td></tr>
          <tr><td>2.1.2</td><td>Wasting time or loitering during working hours</td><td>CAP 1</td></tr>
          <tr><td>2.1.3</td><td>Willful violation of security/safety rules or Physical Security Policy</td><td>CAP 1 up to RT</td></tr>
          <tr><td>2.1.4</td><td>Tailgating or unauthorized access to the area</td><td>CAP 1 up to RT</td></tr>
          <tr><td>2.1.5</td><td>Bringing/using personal equipment that may cause risk</td><td>CAP 1 up to RT</td></tr>
          <tr><td>2.1.6</td><td>Concealment of infectious ailments/diseases</td><td>CAP 1 up to RT</td></tr>
          <tr><td>2.1.7</td><td>Willful disregard of notices/signs (No Smoking, Restricted Areas, etc.)</td><td>CAP 1 up to RT</td></tr>
          <tr><td>2.1.8</td><td>Willful disregard of office directives on safety/sanitation</td><td>CAP 3</td></tr>
          <tr><td>2.1.9</td><td>Unauthorized removal of equipment/devices (fire alarms, safety equipment, recording devices)</td><td>CAP 3</td></tr>
          <tr><td>2.1.10</td><td>Failing to observe sanitation rules, creating unsanitary conditions</td><td>CAP 3</td></tr>
          <tr><td>2.1.11</td><td>Not reporting or refusal to undergo physical examination</td><td>CAP 3</td></tr>
          <tr><td>2.1.12</td><td>Bringing prohibited items inside production floor</td><td>CAP 3</td></tr>
          <tr><td>2.1.13</td><td>Lending/using another employee's Company ID or proximity card</td><td>RT</td></tr>
          <tr><td>2.1.14</td><td>Assisting unauthorized person to enter restricted areas</td><td>RT</td></tr>
          <tr><td>2.1.15</td><td>Acts of subversion, espionage, distribution of subversive materials</td><td>RT</td></tr>
          <tr><td>2.1.16</td><td>Carrying firearms, explosives, harmful materials or weapons</td><td>RT</td></tr>
          <tr><td>2.1.17</td><td>Unauthorized or forcible entry into office premises</td><td>RT</td></tr>
          <tr><td>2.1.18</td><td>Willful destruction, defacement, tampering of Company property, vandalism</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>2.2 Violations related to Drugs, Liquor and Alcohol</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>2.2.1</td><td>Reporting to work under influence of alcohol</td><td>CAP 3 up to RT</td></tr>
          <tr><td>2.2.2</td><td>Reporting to work under influence of drugs/prohibited substances</td><td>CAP 3 up to RT</td></tr>
          <tr><td>2.2.3</td><td>Refusal to undergo drug test or drug rehabilitation</td><td>CAP 3 up to RT</td></tr>
          <tr><td>2.2.4</td><td>Selling drugs, liquor, alcohol in workplace</td><td>RT</td></tr>
          <tr><td>2.2.5</td><td>Bringing/distributing/drinking alcoholic beverages inside premises</td><td>RT</td></tr>
          <tr><td>2.2.6</td><td>Bringing/distributing/possessing prohibited drugs inside premises</td><td>RT</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'cat3',
    title: '3. Performance & Work Code Standards',
    category: 'Violation Catalog',
    tags: ['performance', 'productivity', 'call dropping', 'call riding', 'unethical'],
    keywords: ['performance', 'productivity', 'quality', 'call dropping', 'call riding', 'unethical', 'non-productive', 'conversation', 'work avoidance', 'inappropriate remarks', 'tampering', 'work code'],
    content: `
      <h4>Category 3: Misconduct — Performance and Work Code Standards</h4>
      <p class="kb-source">HR Policy v3.0, Pages 11–12</p>
      <h5>3.1 Operational/Metrics/On-Duty Violations</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>3.1.1</td><td>Failure to meet production or quality standards</td><td>CAP 1 up to RT</td></tr>
          <tr><td>3.1.2</td><td>Performing non-productive work during work hours</td><td>CAP 2</td></tr>
          <tr><td>3.1.3</td><td>Unnecessary conversation</td><td>CAP 2</td></tr>
          <tr><td>3.1.4</td><td>Work avoidance or deliberately avoiding work</td><td>CAP 2 up to RT</td></tr>
          <tr><td>3.1.5</td><td>An act that adversely affects or disrupts work output/productivity</td><td>CAP 2 up to RT</td></tr>
          <tr><td>3.1.6</td><td>Any act of unethical practices</td><td>CAP 2 up to RT</td></tr>
          <tr><td>3.1.7</td><td>Inappropriate remarks (foul/obscene language, sarcastic remarks, arguing with customer)</td><td>CAP 2 up to RT</td></tr>
          <tr><td>3.1.8</td><td>Willfully placing customer on hold beyond limits (call riding)</td><td>CAP 2 up to RT</td></tr>
          <tr><td>3.1.9</td><td>Willfully disconnecting line/call/chat (call dropping)</td><td>CAP 3 up to RT</td></tr>
          <tr><td>3.1.10</td><td>Tampering hardware/client tools to give impression of productive work</td><td>CAP 3 up to RT</td></tr>
          <tr><td>3.1.11</td><td>Unauthorized transfer of call/chat/work to avoid work</td><td>CAP 3 up to RT</td></tr>
          <tr><td>3.1.12</td><td>Directly communicating to customers outside client network</td><td>CAP 3 up to RT</td></tr>
          <tr><td>3.1.13</td><td>Misusing/abusing delegated authorities leading to financial loss</td><td>CAP 3 up to RT</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'cat4',
    title: '4. IT, Data Privacy & Controllership',
    category: 'Violation Catalog',
    tags: ['IT security', 'data privacy', 'mobile phone', 'recording', 'password', 'controllership'],
    keywords: ['IT security', 'data privacy', 'mobile phone', 'recording device', 'password', 'confidential', 'social media', 'BYOD', 'clean desk', 'controllership', 'gift', 'corporate card', 'reimbursement', 'NDA'],
    content: `
      <h4>Category 4: Misconduct — IT Infrastructure, Data Privacy and Controllership</h4>
      <p class="kb-source">HR Policy v3.0, Pages 12–14</p>
      <h5>4.1 IT Security, Information Security, Data Privacy Violation</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>4.1.1</td><td>Attempting to bring storage/recording device in production floor</td><td>CAP 1</td></tr>
          <tr><td>4.1.2</td><td>Violation of Clean Desk/Clear Screen Policy</td><td>CAP 1</td></tr>
          <tr><td>4.1.3</td><td>Violation of Information Security &amp; Privacy Policy</td><td>CAP 1 up to RT</td></tr>
          <tr><td>4.1.4</td><td>Violation of Social Media Digital Communication Policy</td><td>CAP 1 up to RT</td></tr>
          <tr><td>4.1.5</td><td>Violation of Data Privacy Policy</td><td>CAP 1 up to RT</td></tr>
          <tr><td>4.1.6</td><td>Violation of Remote Working, Mobile Computing, and BYOD Policy</td><td>CAP 1 up to RT</td></tr>
          <tr><td>4.1.7</td><td>Violation of mobile phone guidelines or use beyond business purposes</td><td>CAP 1 up to RT</td></tr>
          <tr><td>4.1.8</td><td>Use of internet/facilities for unauthorized transactions or improper use of tools</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.1.9</td><td>Taking/posting pictures/videos of production floor, restricted areas with sensitive materials</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.1.10</td><td>Using/bringing storage or recording device in production floor, training room</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.1.11</td><td>Unauthorized disclosure, capturing, recording, storage of confidential information</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.1.12</td><td>Unauthorized reproduction, circulation, distribution of Company/client records</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.1.13</td><td>Sending non-publicly available materials to unauthorized recipients</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.1.14</td><td>Unauthorized posting of client information on Social Media violating NDA</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.1.15</td><td>Unauthorized access or tampering of websites, tools, systems</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.1.16</td><td>Breach of confidentiality of personal information</td><td>RT</td></tr>
          <tr><td>4.1.17</td><td>Any form of password mishandling including unauthorized sharing</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>4.2 Controllership Violation</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>4.2.1</td><td>Violation of Gift and Entertainment Policy</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.2.2</td><td>Violation of Charitable Giving Policy</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.2.3</td><td>Delayed corporate card payment or outstanding charges not reconciled</td><td>CAP 2 up to RT</td></tr>
          <tr><td>4.2.4</td><td>Misuse or failure to liquidate cash advance/corporate credit card</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.2.5</td><td>Violation of T&amp;L Policy (reimbursement claims, unauthorized use of corporate card)</td><td>CAP 3 up to RT</td></tr>
          <tr><td>4.2.6</td><td>Fraudulent claims and reimbursement</td><td>RT</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'cat5',
    title: '5. Improper Actions, Ethics & Activity',
    category: 'Violation Catalog',
    tags: ['negligence', 'morals', 'conflict of interest', 'harassment', 'insubordination'],
    keywords: ['negligence', 'morals', 'conflict of interest', 'harassment', 'insubordination', 'gambling', 'gossip', 'sabotage', 'moonlighting', 'bullying', 'discrimination', 'sexual harassment', 'anti-corruption', 'abandonment'],
    content: `
      <h4>Category 5: Misconduct — Improper Actions, Ethics and Activity</h4>
      <p class="kb-source">HR Policy v3.0, Pages 15–18</p>
      <h5>5.1 Acts of Negligence</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>5.1.1</td><td>Non-observance of Company's established policy, guidelines and procedures</td><td>CAP 2 up to RT</td></tr>
          <tr><td>5.1.2</td><td>Non-compliance with Company procedures resulting from negligence</td><td>CAP 2 up to RT</td></tr>
          <tr><td>5.1.3</td><td>Failure or neglect to report known issues in a timely manner</td><td>CAP 2</td></tr>
          <tr><td>5.1.4</td><td>Delayed assessment of probationary employee's performance</td><td>CAP 2</td></tr>
          <tr><td>5.1.5</td><td>Delayed or inaccurate closure of annual appraisal/increment form</td><td>CAP 2</td></tr>
          <tr><td>5.1.6</td><td>Non-adherence to Performance Improvement Plan guidelines</td><td>CAP 2</td></tr>
          <tr><td>5.1.7</td><td>Failure to provide medical certificate upon returning to work (2+ days absent)</td><td>CAP 2</td></tr>
          <tr><td>5.1.8</td><td>Delayed processing of employee exit</td><td>CAP 3</td></tr>
          <tr><td>5.1.9</td><td>Negligence in handling Company/client records resulting in damages</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.1.10</td><td>Provision of inaccurate information during hiring or background check</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.1.11</td><td>Failure or neglect to enforce this Policy (including issuance of NTE/CAP)</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.1.12</td><td>Mistakes or omissions due to negligence impacting Company performance</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.1.13</td><td>Failure to disclose involvement in a criminal case</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>5.2 Violations against Morals</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>5.2.1</td><td>Action/statement perceived as detrimental to Company's image or reputation</td><td>CAP 3</td></tr>
          <tr><td>5.2.2</td><td>Improper conduct or discourtesy towards fellow employees, directors, clients</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.3</td><td>Activities/behaviors adversely affecting Company reputation with clients</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.4</td><td>Gambling, betting during Company time or on premises</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.5</td><td>Spreading malicious gossip, creating discord, interfering with work</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.6</td><td>Refusal to return Company property when requested</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.7</td><td>Violation of Anti-Corruption Policy</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.8</td><td>Abandonment of work or duty</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.9</td><td>Willfully restricting work output or encouraging others to do the same</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.10</td><td>Disparagement of Company brand/logo/service mark</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.11</td><td>Insubordination or serious misconduct/willful disobedience</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.2.12</td><td>Logging in/out for another employee or allowing another to do so</td><td>RT</td></tr>
          <tr><td>5.2.13</td><td>Abuse of position/authority for personal gain or benefit</td><td>RT</td></tr>
          <tr><td>5.2.14</td><td>Instigating or participating in unauthorized work stoppage</td><td>RT</td></tr>
          <tr><td>5.2.15</td><td>Accepting money/commission/offer in consideration of any act/contract</td><td>RT</td></tr>
          <tr><td>5.2.16</td><td>Conviction of a crime involving moral turpitude</td><td>RT</td></tr>
          <tr><td>5.2.17</td><td>Sabotage, willful destruction causing damage to Company</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>5.3 Conflicts of Interest</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>5.3.1</td><td>Violation of Conflict-of-Interest Policy</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.3.2</td><td>Soliciting, selling merchandise or collecting funds for personal use during business hours</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.3.3</td><td>Violation of confidentiality agreement (disclosing trade secrets)</td><td>RT</td></tr>
          <tr><td>5.3.4</td><td>Working for competing business, moonlighting</td><td>RT</td></tr>
          <tr><td>5.3.5</td><td>Offering/accepting anything of value in exchange for employment/assignment</td><td>RT</td></tr>
          <tr><td>5.3.6</td><td>Borrowing/lending money that may constitute conflict of interest</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>5.4 Violations against Persons</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>5.4.1</td><td>Use of profane or obscene language against others</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.2</td><td>Any attempt to inflict or cause bodily harm</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.3</td><td>Unwelcome behavior that offends/humiliates/intimidates (discrimination-based)</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.4</td><td>Bullying, derogatory language, name calling, harassing conduct</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.5</td><td>Overt displays of affection, inappropriate gestures, transmitting obscene materials</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.6</td><td>Unwelcome physical conduct, spreading malicious gossip/rumors</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.7</td><td>Abuse of position/authority or commission of harassment (non-sexual)</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.8</td><td>Forms of sexual harassment not covered by ASH Policy</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.9</td><td>Violation of Anti-Sexual Harassment Policy</td><td>CAP 3 up to RT</td></tr>
          <tr><td>5.4.10</td><td>Threats, intimidation, or coercion against any individual</td><td>RT</td></tr>
          <tr><td>5.4.11</td><td>Final conviction of a crime or violation</td><td>RT</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'cat6',
    title: '6. Fraud, Deception & Dishonesty',
    category: 'Violation Catalog',
    tags: ['fraud', 'deception', 'dishonesty', 'cheating', 'forgery', 'misrepresentation'],
    keywords: ['fraud', 'deception', 'dishonesty', 'cheating', 'forgery', 'misrepresentation', 'data manipulation', 'fabrication', 'falsifying', 'confidential', 'misappropriation', 'soliciting'],
    content: `
      <h4>Category 6: Misconduct — Fraud/Deception/Dishonesty</h4>
      <p class="kb-source">HR Policy v3.0, Pages 19–21</p>
      <h5>6.1 Fraud</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>6.1.1</td><td>Unauthorized access to, use of, possession, borrowing, removal, or duplication of confidential documents/files/records including customer data</td><td>RT</td></tr>
          <tr><td>6.1.2</td><td>Without proper authority, revealing/releasing/divulging confidential information or trade/business secrets</td><td>RT</td></tr>
          <tr><td>6.1.3</td><td>Modifying/Accessing information within company or client record without authorization for financial or performance gains</td><td>RT</td></tr>
          <tr><td>6.1.4</td><td>Soliciting a customer to provide direct financial or performance benefits</td><td>RT</td></tr>
          <tr><td>6.1.5</td><td>Misappropriating or withholding Company or client funds or property</td><td>RT</td></tr>
          <tr><td>6.1.6</td><td>Failure to distribute, remit, or report Company monies received from clients</td><td>RT</td></tr>
          <tr><td>6.1.7</td><td>Providing false or misleading information during hiring, throughout employment</td><td>RT</td></tr>
          <tr><td>6.1.8</td><td>Providing false/misleading information or concealing material facts during investigation</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>6.2 Workplace Related Deception/Dishonesty/Fraud</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>6.2.1</td><td>Work-related cheating</td><td>RT</td></tr>
          <tr><td>6.2.2</td><td>Misrepresentation of Data</td><td>RT</td></tr>
          <tr><td>6.2.3</td><td>Data Manipulation, Fabrication/Forgery</td><td>RT</td></tr>
          <tr><td>6.2.4</td><td>Unauthorized diversion or application of Company funds</td><td>RT</td></tr>
          <tr><td>6.2.5</td><td>Misrepresenting, forging, or falsifying personal/Company/client documents</td><td>RT</td></tr>
          <tr><td>6.2.6</td><td>Forging or falsifying submitted medical document or fit to work</td><td>RT</td></tr>
          <tr><td>6.2.7</td><td>Obtaining Company supplies or equipment through fraudulent means</td><td>RT</td></tr>
        </tbody>
      </table>
      <div class="kb-callout kb-callout-danger">
        <strong>Note:</strong> All violations under Category 6 carry a minimum penalty of Review for Termination (RT). These are considered grave offenses.
      </div>
    `
  },
  {
    id: 'cat7',
    title: '7. Attendance Discipline',
    category: 'Violation Catalog',
    tags: ['attendance', 'tardiness', 'absence', 'NCNS', 'absconding'],
    keywords: ['attendance', 'tardiness', 'late', 'absence', 'unauthorized absence', 'NCNS', 'no call no show', 'absconding', 'undertime', 'extended break', 'critical workdays'],
    content: `
      <h4>Category 7: Attendance Discipline</h4>
      <p class="kb-source">HR Policy v3.0, Pages 21–22</p>
      <h5>Attendance Violations</h5>
      <table class="kb-table">
        <thead><tr><th>Code</th><th>Violation</th><th>Penalty</th></tr></thead>
        <tbody>
          <tr><td>7.1</td><td>Tardiness</td><td>CAP 0</td></tr>
          <tr><td>7.2</td><td>Unauthorized undertime or extended break</td><td>CAP 0</td></tr>
          <tr><td>7.3</td><td>Unauthorized Absence (no prior approval / no notification within 2–4 hrs)</td><td>CAP 1</td></tr>
          <tr><td>7.4</td><td>No call No show</td><td>CAP 2</td></tr>
          <tr><td>7.5</td><td>Absence on identified critical workdays</td><td>CAP 2</td></tr>
          <tr><td>7.6</td><td>Absconding for 3+ days</td><td>RT</td></tr>
        </tbody>
      </table>
      <h5>Key Rules</h5>
      <div class="kb-callout kb-callout-info">
        <strong>72-Hour Rule:</strong> NTE must be issued within 72 hours from the time of violation. Only one NTE at a time under the attendance section. Subsequent NTEs may not be issued until currently active cases are resolved.
      </div>
      <div class="kb-callout kb-callout-warning">
        <strong>Escalation:</strong> Multiple violations in one instance &rarr; most severe penalty applies. Additional incident during active CAP &rarr; penalty escalates one level higher.
      </div>
      <h5>Issuance Guidelines</h5>
      <ul class="kb-list">
        <li><strong>CAP 0 to CAP 3:</strong> Issuer is immediate supervisor and/or one-over-one manager. If CAP 3 issued by direct supervisor, it must be signed by one-over-one manager.</li>
        <li><strong>Review for Termination:</strong> Handled by HR standard procedures — NTE issuance, RTWO (Return to Work Order) for absconding cases, NOD issuance, coordination with Legal for termination approval.</li>
      </ul>
    `
  },

  // ============================================================
  // CATEGORY: CAP Reference
  // ============================================================
  {
    id: 'cap-levels',
    title: 'CAP Levels & Active Periods',
    category: 'CAP Reference',
    tags: ['CAP 0', 'CAP 1', 'CAP 2', 'CAP 3', 'suspension', 'termination', 'active period'],
    keywords: ['CAP 0', 'CAP 1', 'CAP 2', 'CAP 3', 'corrective suspension', 'review for termination', 'active period', 'duration', 'days', 'penalty', 'progressive discipline'],
    content: `
      <h4>CAP Levels &amp; Active Periods</h4>
      <p class="kb-source">HR Policy v3.0, Page 5</p>
      <table class="kb-table">
        <thead><tr><th>CAP Level</th><th>Active Period</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>CAP 0</strong></td><td>No active period</td><td>Coaching &amp; Counseling. Documented "Verbal" warning. Minor floor violations. <em>No NTE required.</em></td></tr>
          <tr><td><strong>CAP 1</strong></td><td>60 days</td><td>Minor breach of performance/conduct. Progression from CAP 0. Two-way discussion. Coaching tool.</td></tr>
          <tr><td><strong>CAP 2</strong></td><td>90 days</td><td>Stern reminder and cautionary advice. Improve to acceptable levels.</td></tr>
          <tr><td><strong>CAP 3 / Accelerated</strong></td><td>180 days</td><td>Documented admonition/formal warning. Continued lapses will no longer be tolerated.</td></tr>
          <tr><td><strong>Corrective Suspension</strong></td><td>N/A</td><td>Imposed for grave violations, recommended by Legal Team.</td></tr>
          <tr><td><strong>Review for Termination</strong></td><td>N/A</td><td>Bars re-employment. For grave violations or escalation from CAP 3.</td></tr>
        </tbody>
      </table>
      <h5>Corrective Suspension Durations (Annex I)</h5>
      <table class="kb-table">
        <thead><tr><th>CAP Level</th><th>Suspension Duration</th></tr></thead>
        <tbody>
          <tr><td>CAP 1</td><td>1–2 days</td></tr>
          <tr><td>CAP 2</td><td>3–4 days</td></tr>
          <tr><td>CAP 3</td><td>5–7 days</td></tr>
        </tbody>
      </table>
      <h5>During Active Period</h5>
      <ul class="kb-list">
        <li>Employee is <strong>NOT eligible</strong> for promotion, internal job posting, or VIC</li>
        <li>May impact Annual Performance Bonus</li>
        <li>Active Period starts from issuance of NOD or 3 weeks from administrative hearing, whichever comes first</li>
        <li>VIC voided/cancelled during month a sanction is served</li>
      </ul>
    `
  },
  {
    id: 'cap-response',
    title: 'NTE Response Timeframes',
    category: 'CAP Reference',
    tags: ['NTE', 'response', 'timeframe', '48 hours', '5 days'],
    keywords: ['NTE', 'response', 'timeframe', '48 hours', '5 days', 'deadline', 'reply', 'explanation'],
    content: `
      <h4>NTE Response Timeframes</h4>
      <p class="kb-source">HR Policy v3.0, Page 3</p>
      <table class="kb-table">
        <thead><tr><th>Potential Penalty</th><th>Response Window</th></tr></thead>
        <tbody>
          <tr><td>CAP 2 or below</td><td><strong>At least 48 hours</strong> from receipt of NTE</td></tr>
          <tr><td>CAP 3 up to Termination</td><td><strong>At least 5 days</strong> from receipt of NTE</td></tr>
        </tbody>
      </table>
      <div class="kb-callout kb-callout-info">
        <strong>Tip:</strong> In Playbook, the aging indicator turns <span style="color:#EF4444;font-weight:600;">red (overdue)</span> when the response deadline has passed without a CAP decision.
      </div>
    `
  },
  {
    id: 'progression-rules',
    title: 'Progression & Escalation Rules',
    category: 'CAP Reference',
    tags: ['progression', 'escalation', 'multiple violations', 'active period'],
    keywords: ['progression', 'escalation', 'multiple violations', 'active period', 'highest penalty', 'escalate', 'termination'],
    content: `
      <h4>Progression &amp; Escalation Rules</h4>
      <p class="kb-source">HR Policy v3.0, Page 8</p>
      <h5>For Categories 1–6 (Misconduct)</h5>
      <ul class="kb-list">
        <li><strong>Multiple violations in one instance:</strong> The highest indicated penalty applies.</li>
        <li><strong>Additional violations during active period:</strong> Subject to escalated corrective action, which may include termination.</li>
      </ul>
      <h5>For Category 7 (Attendance)</h5>
      <ul class="kb-list">
        <li><strong>Multiple violations:</strong> Most severe penalty associated with each individual violation applies.</li>
        <li><strong>During active CAP:</strong> Penalty escalates one level higher.</li>
        <li><strong>72-hour threshold:</strong> For CAP 3 attendance violations committed within first 48-hour period, they are ineligible for subsequent escalation as it will exceed the 72-hour threshold.</li>
      </ul>
      <h5>Example: Multiple Violations</h5>
      <table class="kb-table">
        <thead><tr><th>Violations</th><th>Individual Sanction</th><th>Final Sanction</th></tr></thead>
        <tbody>
          <tr><td>Unauthorized Absence + Tardiness</td><td>CAP 1 + CAP 0</td><td><strong>CAP 1</strong> (highest applies)</td></tr>
        </tbody>
      </table>
      <h5>Example: During Active Period</h5>
      <table class="kb-table">
        <thead><tr><th>Scenario</th><th>Violation</th><th>Final Sanction</th></tr></thead>
        <tbody>
          <tr><td>Employee under CAP 1 active period</td><td>Tardiness (normally CAP 0)</td><td><strong>CAP 2</strong> (escalated one level)</td></tr>
        </tbody>
      </table>
    `
  },

  // ============================================================
  // CATEGORY: Process Guide
  // ============================================================
  {
    id: 'process-nte',
    title: 'NTE Issuance Process',
    category: 'Process Guide',
    tags: ['NTE', 'issuance', 'process', 'notice to explain'],
    keywords: ['NTE', 'notice to explain', 'issuance', 'process', 'create', 'supervisor', 'HRBP', 'contents', 'facts', 'violation'],
    content: `
      <h4>NTE Issuance Process</h4>
      <p class="kb-source">HR Policy v3.0, Pages 3, 6</p>
      <h5>Who Issues NTEs</h5>
      <ul class="kb-list">
        <li>Immediate supervisor/manager issues NTE and NOD</li>
        <li>In certain cases, HRBP issues NTE</li>
        <li>Cases leading to Review for Termination &rarr; investigated by HR and/or Compliance Team</li>
      </ul>
      <h5>NTE Contents</h5>
      <ul class="kb-list">
        <li>Facts of the case (specific acts or omissions)</li>
        <li>Alleged violation committed</li>
        <li>Timeframe given to employee to respond</li>
        <li>Possible penalty</li>
        <li>Time and venue of scheduled administrative hearings, if applicable</li>
        <li>Notice of preventive suspension, if warranted</li>
      </ul>
      <h5>In Playbook</h5>
      <ol class="kb-list">
        <li>Go to <strong>Corrective Actions</strong> tab</li>
        <li>Click <strong>Document Build Assist</strong> &rarr; Select <strong>NTE</strong></li>
        <li>Follow the 4-step wizard: Employee &rarr; Violation &rarr; Narrative &rarr; Confirm</li>
        <li>The NTE record is saved with status <strong>"Served"</strong></li>
      </ol>
    `
  },
  {
    id: 'process-cap',
    title: 'CAP Decision Process',
    category: 'Process Guide',
    tags: ['CAP', 'decision', 'assign', 'dismiss', 'NOD'],
    keywords: ['CAP', 'decision', 'assign', 'dismiss', 'NOD', 'notice of decision', 'deliberation', 'hearing', 'penalty'],
    content: `
      <h4>CAP Decision Process</h4>
      <p class="kb-source">HR Policy v3.0, Pages 4–5</p>
      <h5>Notice of Decision (NOD)</h5>
      <p>Issued to employee whether or not found guilty. Contains:</p>
      <ul class="kb-list">
        <li>Facts of the case</li>
        <li>Brief summary of employee's explanation</li>
        <li>Violation committed</li>
        <li>Whether employee attended hearing</li>
        <li>Sanction imposed and its active period</li>
      </ul>
      <h5>If Penalty is CAP 0–3</h5>
      <ol class="kb-list">
        <li>Supervisor/HR formally notifies employee of violation</li>
        <li>Employee notified of alleged violation, afforded opportunity for verbal explanation</li>
        <li>Supervisor documents expectations using coaching &amp; counseling format</li>
        <li>Discussion acknowledged by employee and supervisor; one copy to employee, one retained by supervisor</li>
      </ol>
      <h5>If Penalty is Review for Termination</h5>
      <ol class="kb-list">
        <li>Supervisor prepares incident report with documentation</li>
        <li>If acts constitute violation, supervisor/HRBP prepares NTE (reviewed by one-over-one manager and HR)</li>
        <li>NOD issued after deliberation by HR/Enterprise Team/Review Committee</li>
        <li>Case dismissed/closed only after all corrective action memos submitted to HR</li>
      </ol>
      <h5>In Playbook</h5>
      <ol class="kb-list">
        <li>Open the NTE record from the Corrective Actions table</li>
        <li>Click <strong>Assign CAP</strong> to select the appropriate CAP level</li>
        <li>Or use <strong>Document Build Assist &rarr; CAP 1</strong> for AI-assisted deliberation and DOCX generation</li>
        <li>Click <strong>Dismiss</strong> if the employee is absolved</li>
      </ol>
    `
  },
  {
    id: 'process-preventive-suspension',
    title: 'Preventive Suspension',
    category: 'Process Guide',
    tags: ['preventive suspension', 'PSO', 'legal team'],
    keywords: ['preventive suspension', 'PSO', 'legal team', 'serious', 'imminent threat', 'salary', 'absolved'],
    content: `
      <h4>Preventive Suspension</h4>
      <p class="kb-source">HR Policy v3.0, Page 7</p>
      <ul class="kb-list">
        <li>Imposed for serious/imminent threats</li>
        <li>Subject to <strong>Legal Team approval</strong></li>
        <li>If absolved, employee gets paid for suspension period</li>
        <li>Salary held off on day 1 of PSO issuance</li>
      </ul>
    `
  },

  // ============================================================
  // CATEGORY: FAQ
  // ============================================================
  {
    id: 'faq-who-creates-nte',
    title: 'Who can create an NTE?',
    category: 'FAQ',
    tags: ['NTE', 'create', 'who', 'permission'],
    keywords: ['who', 'create', 'NTE', 'permission', 'team lead', 'manager', 'TL'],
    content: `
      <h4>Who can create an NTE?</h4>
      <p>Per HR Policy v3.0 (Page 6), the <strong>immediate supervisor/manager</strong> issues the NTE and NOD. In Playbook, users with the <strong>Team Lead</strong> or <strong>Manager</strong> role can create NTEs via the Document Build Assist wizard.</p>
      <p>In certain cases, HRBP may also issue NTEs. Cases leading to Review for Termination are investigated by HR and/or the Compliance Team.</p>
    `
  },
  {
    id: 'faq-response-deadline',
    title: 'How long does an agent have to respond to an NTE?',
    category: 'FAQ',
    tags: ['NTE', 'response', 'deadline', 'hours', 'days'],
    keywords: ['response', 'deadline', 'hours', 'days', 'reply', 'NTE', 'how long'],
    content: `
      <h4>How long does an agent have to respond to an NTE?</h4>
      <ul class="kb-list">
        <li><strong>CAP 2 or below:</strong> At least <strong>48 hours</strong> from receipt of NTE</li>
        <li><strong>CAP 3 up to Termination:</strong> At least <strong>5 days</strong> from receipt of NTE</li>
      </ul>
      <p>In Playbook, the aging indicator on the Corrective Actions table turns red when the response deadline has passed.</p>
    `
  },
  {
    id: 'faq-active-period',
    title: 'What happens during an active CAP period?',
    category: 'FAQ',
    tags: ['active period', 'promotion', 'VIC', 'bonus'],
    keywords: ['active period', 'promotion', 'VIC', 'bonus', 'eligible', 'ineligible', 'during', 'consequences'],
    content: `
      <h4>What happens during an active CAP period?</h4>
      <p>During the active period, the employee is:</p>
      <ul class="kb-list">
        <li><strong>NOT eligible</strong> for promotion</li>
        <li><strong>NOT eligible</strong> for internal job posting</li>
        <li><strong>NOT eligible</strong> for VIC (Value in Culture award)</li>
        <li>May have their <strong>Annual Performance Bonus</strong> impacted</li>
        <li>VIC is voided/cancelled during the month a sanction is served</li>
      </ul>
      <p>The active period starts from issuance of NOD or 3 weeks from the administrative hearing, whichever comes first.</p>
    `
  },
  {
    id: 'faq-escalation',
    title: 'What if an agent commits another violation during active CAP?',
    category: 'FAQ',
    tags: ['escalation', 'active period', 'additional violation'],
    keywords: ['escalation', 'active period', 'additional', 'another', 'violation', 'during', 'CAP'],
    content: `
      <h4>What if an agent commits another violation during active CAP?</h4>
      <p>Employees who incur additional violations during an active period may be subject to <strong>escalated corrective action</strong>, which may include termination, depending on the severity and nature of the subsequent violation.</p>
      <p>For attendance violations specifically, the penalty escalates one level higher. For example, if an employee under CAP 1 active period commits Tardiness (normally CAP 0), the final sanction is <strong>CAP 2</strong>.</p>
    `
  },
  {
    id: 'faq-cap0-no-nte',
    title: 'Does CAP 0 require an NTE?',
    category: 'FAQ',
    tags: ['CAP 0', 'NTE', 'required', 'verbal warning'],
    keywords: ['CAP 0', 'NTE', 'required', 'verbal warning', 'coaching', 'counseling'],
    content: `
      <h4>Does CAP 0 require an NTE?</h4>
      <p><strong>No.</strong> CAP 0 is a Coaching &amp; Counseling action — a documented "verbal" warning for minor floor violations. It does not require a formal NTE. Use the Coaching Profile in Compass to document CAP 0 discussions.</p>
    `
  },
  {
    id: 'faq-dismiss-nte',
    title: 'When should I dismiss an NTE?',
    category: 'FAQ',
    tags: ['dismiss', 'NTE', 'absolved', 'close'],
    keywords: ['dismiss', 'NTE', 'absolved', 'close', 'when', 'no violation'],
    content: `
      <h4>When should I dismiss an NTE?</h4>
      <p>Dismiss an NTE when:</p>
      <ul class="kb-list">
        <li>After deliberation, the employee is found <strong>not guilty</strong> of the alleged violation</li>
        <li>The facts of the case do not support the allegation</li>
        <li>The employee provides a satisfactory explanation that clears them</li>
      </ul>
      <p>A dismissed NTE still remains in the employee's history for record-keeping purposes, but carries no penalty or active period.</p>
    `
  },
  {
    id: 'faq-attendance-72hr',
    title: 'What is the 72-hour rule for attendance NTEs?',
    category: 'FAQ',
    tags: ['72 hours', 'attendance', 'NTE', 'rule', 'threshold'],
    keywords: ['72 hours', 'attendance', 'NTE', 'rule', 'threshold', 'one at a time', 'reset'],
    content: `
      <h4>What is the 72-hour rule for attendance NTEs?</h4>
      <p>Under the Attendance Discipline section (Category 7):</p>
      <ul class="kb-list">
        <li>An NTE must be issued <strong>within 72 hours</strong> from the time of the violation</li>
        <li>An employee may only be issued <strong>one NTE at a time</strong> under the attendance section</li>
        <li>Subsequent NTEs may not be issued until currently active cases are resolved</li>
        <li>All incidents are <strong>reset</strong> after satisfaction of and clearance of the corrective action period</li>
      </ul>
    `
  },
  {
    id: 'faq-playbook-workflow',
    title: 'What is the Playbook NTE-to-CAP workflow?',
    category: 'FAQ',
    tags: ['Playbook', 'workflow', 'NTE', 'CAP', 'steps'],
    keywords: ['Playbook', 'workflow', 'NTE', 'CAP', 'steps', 'how to', 'process', 'document build assist'],
    content: `
      <h4>What is the Playbook NTE-to-CAP workflow?</h4>
      <ol class="kb-list">
        <li><strong>Create NTE:</strong> Go to Corrective Actions &rarr; Document Build Assist &rarr; NTE. Follow the wizard to generate the NTE document.</li>
        <li><strong>Serve NTE:</strong> The NTE is saved with status "Served" and appears in the table.</li>
        <li><strong>Agent responds:</strong> The agent replies via email (outside Playbook). There is no "Explanation Logged" step in Playbook.</li>
        <li><strong>TL decides:</strong> Open the NTE record &rarr; Click <strong>Assign CAP</strong> to select the appropriate CAP level, or <strong>Dismiss</strong> if absolved.</li>
        <li><strong>For CAP 1:</strong> Use Document Build Assist &rarr; CAP 1 for AI-assisted deliberation and DOCX generation.</li>
        <li><strong>CAP auto-expires:</strong> When the active period ends, the status automatically transitions to "Expired."</li>
      </ol>
    `
  }
];

// ---- Category list for sidebar tabs ----
const CA_KB_CATEGORIES = ['All', 'Violation Catalog', 'CAP Reference', 'Process Guide', 'FAQ'];
