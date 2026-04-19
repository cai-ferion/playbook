/**
 * HR Policy Violations & Penalties Catalog (GP HR Procedures & Policy 3.0)
 * Extracted from GPHRProcedures&Policy3.0-02.01.26.pdf (Version 3.0, Feb 1 2026)
 *
 * Structure:
 *   Section  (x.)   → category
 *   Subsection (x.y) → subsection
 *   Sub-subsection (x.y.z) → selectable violation item
 *
 * The NTE wizard picker selects at the sub-subsection level.
 * Items without sub-subsections (e.g. 7.1 Tardiness) are directly selectable.
 */
const HR_VIOLATIONS = [
  {
    category: "1. Misconduct- Basic Discipline",
    subsections: [
      {
        code: "1.1",
        title: "Protocol Violations",
        items: [
          { code: "1.1.1", text: "Failure to wear the prescribed dress code or violation of Genpact Philippines Dress Code Guidelines", penalty: "CAP 0" },
          { code: "1.1.2", text: "Drinking from a non-spill proof beverage vessel at workstations", penalty: "CAP 0" },
          { code: "1.1.3", text: "Bringing/eating food inside production floor without proper approval", penalty: "CAP 0" },
          { code: "1.1.4", text: "Violation of I&L Food Policy", penalty: "CAP 0" },
          { code: "1.1.5", text: "Violation of I&L Restroom Usage Policy", penalty: "CAP 0" },
          { code: "1.1.6", text: "Violation of I&L Power Nap Room Policy", penalty: "CAP 0" },
          { code: "1.1.7", text: "Non completion of Genpact and/or client mandatory courses within required timeline", penalty: "CAP 1" },
          { code: "1.1.8", text: "Sleeping in the workstation, non-designated areas and the like", penalty: "CAP 1" },
          { code: "1.1.9", text: "Mistakes or omissions due to carelessness that may have potential or unrealized impact to the Company and/or its clients", penalty: "CAP 1" },
          { code: "1.1.10", text: "Any minor violation that is analogous to the foregoing", penalty: "CAP 1" }
        ]
      }
    ]
  },
  {
    category: "2. Misconduct- On Facilities and Workplace Standards",
    subsections: [
      {
        code: "2.1",
        title: "Violations against Safety, Security, Sanitation and Order",
        items: [
          { code: "2.1.1", text: "Failure to wear the proximity/ID Card while within the office premises and to display it at points of entry and exit", penalty: "CAP 1" },
          { code: "2.1.2", text: "Wasting time or loitering during working hours, including but not limited to being in an area where the employee has no legitimate business", penalty: "CAP 1" },
          { code: "2.1.3", text: "Willful violation of security or safety rules or failure to observe safety rules or practices or violation of Physical Security Policy", penalty: "CAP 1 up to Review for Termination" },
          { code: "2.1.4", text: "Tailgating or unauthorized access to the area", penalty: "CAP 1 up to Review for Termination" },
          { code: "2.1.5", text: "Bringing or using personal equipment within the company premises that may cause or have caused risk", penalty: "CAP 1 up to Review for Termination" },
          { code: "2.1.6", text: "Concealment of infectious ailments or diseases which endangers fellow employees", penalty: "CAP 1 up to Review for Termination" },
          { code: "2.1.7", text: "Willful disregard of notices and signs such as \"No Smoking/Vaping Restricted Areas, No Cellphones\", etc.", penalty: "CAP 1 up to Review for Termination" },
          { code: "2.1.8", text: "Willful disregard of office directives relating to safety, cleanliness, orderliness, sanitation and security of office supplies, equipment and other Company property", penalty: "CAP 3" },
          { code: "2.1.9", text: "Unauthorized removal from its designated location of the Company and/or building's equipment and devices, such as fire alarms, smoke detectors or any security or safety equipment or safety notices, warnings or directions. Usage of recording devices (including videos recorder, camcorder, cameras, CD, pen drive, mobile phones, etc.) wherever prohibited and for other than approved purposes in office premises or found to have used these things/devices to carry any information or data related to process", penalty: "CAP 3" },
          { code: "2.1.10", text: "Failing to observe Company rules on sanitation, creating or contributing to unsanitary conditions, or failing to use or improper use of sanitary facilities", penalty: "CAP 3" },
          { code: "2.1.11", text: "Not reporting or refusal to undergo physical examination", penalty: "CAP 3" },
          { code: "2.1.12", text: "Bringing of prohibited items without proper approval inside production floor such as but not limited to bags, non-Genpact issued IT peripherals, personal effects", penalty: "CAP 3" },
          { code: "2.1.13", text: "Lending own or using another employee's Company ID or proximity card or any identification materials to gain access to Company premises or restricted areas", penalty: "Review for Termination" },
          { code: "2.1.14", text: "Assisting any unauthorized person to enter access to Company premises or restricted areas", penalty: "Review for Termination" },
          { code: "2.1.15", text: "Acts of subversion including the distribution of subversive materials within Company premises; engaging in espionage, and other acts inimical to the security and interest of the Company", penalty: "Review for Termination" },
          { code: "2.1.16", text: "Carrying of firearms, explosives, inflammable or harmful materials or weapons", penalty: "Review for Termination" },
          { code: "2.1.17", text: "Unauthorized or forcible entry into the office or Company premises", penalty: "Review for Termination" },
          { code: "2.1.18", text: "Willful, deliberate or malicious destruction, defacement or tampering of Company or employee property; or any acts of vandalism or graffiti within Company premises", penalty: "Review for Termination" }
        ]
      },
      {
        code: "2.2",
        title: "Violations related to Drugs, Liquor and Alcohol",
        items: [
          { code: "2.2.1", text: "Reporting to work under the influence of alcohol", penalty: "CAP 3 up to Review for Termination" },
          { code: "2.2.2", text: "Reporting to work under the influence of any drugs or prohibited substances", penalty: "CAP 3 up to Review for Termination" },
          { code: "2.2.3", text: "Refusal to undergo drug test or drug rehabilitation", penalty: "CAP 3 up to Review for Termination" },
          { code: "2.2.4", text: "Selling any drugs, liquor, alcohol and the like in the workplace", penalty: "Review for Termination" },
          { code: "2.2.5", text: "Bringing, distributing or drinking any form of liquor or alcoholic or intoxicating beverages inside company premises", penalty: "Review for Termination" },
          { code: "2.2.6", text: "Bringing, distributing, possessing or taking of any prohibited drugs inside the Company premises", penalty: "Review for Termination" }
        ]
      }
    ]
  },
  {
    category: "3. Misconduct- Performance and Work Code Standards",
    subsections: [
      {
        code: "3.1",
        title: "Operational/Metrics/On-Duty Violations",
        items: [
          { code: "3.1.1", text: "Failure to meet production or quality standards. *Applicable to accounts with established escalation matrix- A) Low Risk, B) Medium Risk, C) High Risk", penalty: "CAP 1 up to Review for Termination" },
          { code: "3.1.2", text: "Performing non-productive work during work hours", penalty: "CAP 2" },
          { code: "3.1.3", text: "Unnecessary conversation", penalty: "CAP 2" },
          { code: "3.1.4", text: "Work avoidance or any act that is deliberately avoiding work", penalty: "CAP 2 up to Review for Termination" },
          { code: "3.1.5", text: "An act that adversely affects or disrupts work output or productivity", penalty: "CAP 2 up to Review for Termination" },
          { code: "3.1.6", text: "Any act of unethical practices", penalty: "CAP 2 up to Review for Termination" },
          { code: "3.1.7", text: "Inappropriate remarks which include but not limited to use of foul or obscene or vulgar language, uttering sarcastic or unnecessary side remarks, gross discourtesy to a customer, arguing with a customer in an unprofessional manner, uttering rude remarks to customers", penalty: "CAP 2 up to Review for Termination" },
          { code: "3.1.8", text: "Willfully placing the customer on hold beyond client-specified limitations until customer disconnects or staying on a customer unattended line to prevent himself to go back to the call queue otherwise known as call riding", penalty: "CAP 2 up to Review for Termination" },
          { code: "3.1.9", text: "Willfully or deliberately disconnecting the line or call or chat or pressing the disconnect button to clear the line while a caller or customer is still speaking on the line. This is otherwise known as call dropping", penalty: "CAP 3 up to Review for Termination" },
          { code: "3.1.10", text: "Tampering hardware peripherals or client application/tools to give the impression of productive work", penalty: "CAP 3 up to Review for Termination" },
          { code: "3.1.11", text: "Unauthorized transfer of call, chat, work to avoid work or to manipulate productivity", penalty: "CAP 3 up to Review for Termination" },
          { code: "3.1.12", text: "Directly communicating to end customers outside of client network or through unauthorized/unofficial channels", penalty: "CAP 3 up to Review for Termination" },
          { code: "3.1.13", text: "Misusing and abusing of delegated authorities that leads to financial loss", penalty: "CAP 3 up to Review for Termination" }
        ]
      }
    ]
  },
  {
    category: "4. Misconduct- IT Infrastructure, Data Privacy and Controllership",
    subsections: [
      {
        code: "4.1",
        title: "IT Security, Information Security, Data Privacy Violation",
        items: [
          { code: "4.1.1", text: "Attempting to bring any storage or recording device in the production floor or training room", penalty: "CAP 1" },
          { code: "4.1.2", text: "Violation of Clean Desk/Clear Screen Policy", penalty: "CAP 1" },
          { code: "4.1.3", text: "Violation of Information Security & Privacy Policy", penalty: "CAP 1 up to Review for Termination" },
          { code: "4.1.4", text: "Violation of Genpact's Social Media Digital Communication Policy", penalty: "CAP 1 up to Review for Termination" },
          { code: "4.1.5", text: "Violation of Genpact's Data Privacy Policy", penalty: "CAP 1 up to Review for Termination" },
          { code: "4.1.6", text: "Violation of Remote Working, Mobile Computing, and BYOD Policy", penalty: "CAP 1 up to Review for Termination" },
          { code: "4.1.7", text: "Violation of mobile phone guidelines or use of mobile phones beyond business purposes. (For accounts where mobile phones are permitted for MFA or approved by the client)", penalty: "CAP 1 up to Review for Termination" },
          { code: "4.1.8", text: "Use of internet and other similar facilities or properties for purposes other than authorized transactions or Improper use and handling of Company, client system tools or applications", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.1.9", text: "Taking or posting pictures or videos of Genpact production floor, training rooms and other restricted areas containing Genpact materials or client proprietary or client logo/name or sensitive information in any form of media. This includes any employee who participated in pictures or videos recordings", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.1.10", text: "Using or bringing in any storage or recording device (e.g. mobile phone, camera, smart watch, smart devices, etc.) in the production floor, training room, or restricted area", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.1.11", text: "Unauthorized disclosure, capturing, recording, or storage of Genpact or client confidential information or sharing non-publicly available employee, client or customer personal information without consent or authorization", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.1.12", text: "Unauthorized reproduction, circulation or distribution of Company or client records, documents and other similar property", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.1.13", text: "Sending non-publicly available Genpact or client materials to unauthorized recipients or to personal mailbox", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.1.14", text: "Unauthorized posting of client information in any Social Media platform or forums which violates Non-Disclosure Agreement", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.1.15", text: "Unauthorized access or tampering of websites, tools, systems etc. (e.g. destroying, deleting important data, stopping anti-virus service, removing firewalls, mail forgery, use of unlicensed software, or downloading inappropriate material) The usage of software should be in line with the Genpact Software Governance & Compliance Policy Document", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.1.16", text: "Breach of confidentiality of personal information", penalty: "Review for Termination" },
          { code: "4.1.17", text: "Any form of password mishandling which including unauthorized sharing of passwords or the use of another person's password", penalty: "Review for Termination" }
        ]
      },
      {
        code: "4.2",
        title: "Controllership Violation",
        items: [
          { code: "4.2.1", text: "Violation of Gift and Entertainment Policy", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.2.2", text: "Violation of Charitable Giving Policy", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.2.3", text: "Delayed corporate card payment or outstanding corporate credit card charges not reconciled by the employee", penalty: "CAP 2 up to Review for Termination" },
          { code: "4.2.4", text: "Misuse or failure to liquidate cash advance proceeds and/or corporate credit card", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.2.5", text: "Violation of T&L Policy including reimbursement claim violation, inappropriate travel, unauthorized use of corporate credit card for personal expenses", penalty: "CAP 3 up to Review for Termination" },
          { code: "4.2.6", text: "Fraudulent claims and reimbursement", penalty: "Review for Termination" }
        ]
      }
    ]
  },
  {
    category: "5. Misconduct- Improper Actions, Ethics and Activity",
    subsections: [
      {
        code: "5.1",
        title: "Acts of Negligence",
        items: [
          { code: "5.1.1", text: "Non-observance of Company's established policy, guidelines and procedures", penalty: "CAP 2 up to Review for Termination" },
          { code: "5.1.2", text: "Non-compliance with Company established procedures resulting from negligence", penalty: "CAP 2 up to Review for Termination" },
          { code: "5.1.3", text: "Failure or neglect to report any known issues (eg. system related, technical, etc) in a timely manner through proper escalation", penalty: "CAP 2" },
          { code: "5.1.4", text: "Delayed assessment of probationary employee's performance. Employee should be assessed one month before regularization date", penalty: "CAP 2" },
          { code: "5.1.5", text: "Delayed or inaccurate closure of annual appraisal or annual increment form. All appraisals must be finalized within three (3) months from the annual appraisal date", penalty: "CAP 2" },
          { code: "5.1.6", text: "Non-adherence to Performance Improvement Plan guidelines", penalty: "CAP 2" },
          { code: "5.1.7", text: "Failure to provide a medical certificate or fitness-to-work certification from an HMO-accredited physician upon returning to work", penalty: "CAP 2" },
          { code: "5.1.8", text: "Delayed processing of employee exit", penalty: "CAP 3" },
          { code: "5.1.9", text: "Negligence in handling Company or client records resulting in damages to the Company, its employees, or clients", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.1.10", text: "Provision of inaccurate information during hiring process or background check whether intentional or unintentional", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.1.11", text: "Failure or neglect to enforce this Policy, including but not limited to issuance of NTE, Issuance of Corrective Action Document, etc.", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.1.12", text: "Mistakes or omissions due to negligence, impacting to the Company performance, productivity, client satisfaction, or the Company's reputation or standing", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.1.13", text: "Failure to disclose involvement as a principal, accomplice or accessory in a criminal case occurring outside of company premises", penalty: "Review for Termination" }
        ]
      },
      {
        code: "5.2",
        title: "Violations against Morals",
        items: [
          { code: "5.2.1", text: "Any action or statement that could reasonably be perceived as detrimental to the Company's image or reputation", penalty: "CAP 3" },
          { code: "5.2.2", text: "Engaging in improper conduct or acts exhibiting discourtesy or disrespect towards fellow employees, Company directors, representatives, agents, suppliers, visitor, clients", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.3", text: "Engaging in activities or behaviors with client representatives that adversely affects Company reputation or relationship with client", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.4", text: "Engaging in gambling, betting, or participation in any form of game of chance during Company time, on Company premises or facilities", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.5", text: "Spreading malicious gossip rumors, engaging in behaviors designed to create discord or lack of harmony, or interfering with another employee's work assignment", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.6", text: "Refusal to return Company property assigned to an employee's custody when requested by immediate supervisor or authorized Company officials", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.7", text: "Violation of Anti-Corruption Policy", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.8", text: "Abandonment of work or duty", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.9", text: "Willfully restricting work output or encouraging others to do the same", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.10", text: "Disparagement or bringing into ill repute the image, brand, logo, or any other service mark of the Company and its affiliates", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.11", text: "Insubordination or serious misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection with his work", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.2.12", text: "Logging in/out for another employee or allowing another employee to perform such actions for oneself", penalty: "Review for Termination" },
          { code: "5.2.13", text: "Abuse of position or authority for personal gain or which benefits fellow employees, Company directors, representatives, agents, suppliers, visitors or clients, in return for any sum of money, unauthorized commission, offer, or promise in consideration of any act, contract, decision or services", penalty: "Review for Termination" },
          { code: "5.2.14", text: "Instigating or participating in any form of unauthorized work stoppage", penalty: "Review for Termination" },
          { code: "5.2.15", text: "Accepting directly or indirectly any sum of money, unauthorized commission, offer, or promise in consideration of any act, contract, decision or service connected with the discharge of an employee's official duties", penalty: "Review for Termination" },
          { code: "5.2.16", text: "Conviction of a crime involving moral turpitude", penalty: "Review for Termination" },
          { code: "5.2.17", text: "Sabotage, willful destruction causing damage to Company reputation or property", penalty: "Review for Termination" }
        ]
      },
      {
        code: "5.3",
        title: "Conflicts of Interest",
        items: [
          { code: "5.3.1", text: "Violation of Conflict-of-Interest Policy", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.3.2", text: "Soliciting, selling merchandise or collecting funds for personal use (which may include but not limited to borrowing, pawning, lending and the like), charities or otherwise during business hours, or at a time or place that interferes with the work of another employee without authorization", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.3.3", text: "Violation of the confidentiality agreement, which includes, but not limited to disclosing confidential or proprietary Company information such as trade secrets, plans, operations, finances or other classified matters or information to competitors or other organizations or to unauthorized employees or persons", penalty: "Review for Termination" },
          { code: "5.3.4", text: "Working for competing business, moonlighting or engaging in activities prejudicial to Company interest", penalty: "Review for Termination" },
          { code: "5.3.5", text: "Offering or accepting anything of value in exchange for an employment, work assignment, work location or other favorable conditions of employment", penalty: "Review for Termination" },
          { code: "5.3.6", text: "Borrowing or lending of money or property that may constitute a conflict of interest such as but not limited to direct reporting lines or any position that may exert influence", penalty: "Review for Termination" }
        ]
      },
      {
        code: "5.4",
        title: "Violations against Persons",
        items: [
          { code: "5.4.1", text: "Use of profane or obscene language against fellow employees, Company directors, representatives, agents, suppliers, visitors, clients or its customers whether oral or in writing, via e-mail, or other forms of communication", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.2", text: "Any attempt to inflict or cause bodily harm upon another employee, company agents or representatives, visitors or clients within the Company premises or during official company functions", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.3", text: "Unwelcome and uninvited behavior that offends, humiliates, intimidates and is based on the grounds of discrimination. Harassment may be committed verbally, physically, by electronic means", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.4", text: "Bullying, or use derogatory language, name calling, or any other conduct that could be considered harassing, or discriminatory including racist slurs, insults, threats or suggestive comments about someone's physical appearance etc.", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.5", text: "Behaviors such as overt displays of affection or familiarity, inappropriate gestures or looks, pursuing or whistling at individuals, transmitting obscene e-mails, SMS, MMS, messages, and disseminating offensive or derogatory written materials", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.6", text: "Unwelcome physical conduct as well as spreading of malicious gossip, rumors and innuendos", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.7", text: "Abuse of position or authority or the commission of other forms of harassment (except sexual harassment) in the workplace", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.8", text: "Forms of sexual harassment not covered by the Anti-Sexual Harassment Policy", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.9", text: "Violation of Anti-Sexual Harassment Policy (ASH Policy will govern)", penalty: "CAP 3 up to Review for Termination" },
          { code: "5.4.10", text: "Any action that constitutes threats, intimidation or coercion against any individual, or which in any manner unduly interferes with fellow employees, the Company's agents or representatives, clients or visitors", penalty: "Review for Termination" },
          { code: "5.4.11", text: "Final conviction of a crime or violation whether as a principal, accomplice or accessory", penalty: "Review for Termination" }
        ]
      }
    ]
  },
  {
    category: "6. Misconduct- Fraud/Deception/Dishonesty",
    subsections: [
      {
        code: "6.1",
        title: "Fraud",
        items: [
          { code: "6.1.1", text: "Unauthorized access to, use of, possession, borrowing, removal, or duplication of confidential documents, files, programs and records including customer data", penalty: "Review for Termination" },
          { code: "6.1.2", text: "Without proper authority, revealing, releasing or divulging confidential information, trade or business secrets to individuals other than those authorized by the Company", penalty: "Review for Termination" },
          { code: "6.1.3", text: "Modifying/Accessing information within a company or client record without authorization or through associated business process that led to a financial or performance gains", penalty: "Review for Termination" },
          { code: "6.1.4", text: "Soliciting a customer to provide direct financial or performance benefits", penalty: "Review for Termination" },
          { code: "6.1.5", text: "Misappropriating or withholding Company or client funds or property, including failure to distribute incentive money or prizes to qualified agents", penalty: "Review for Termination" },
          { code: "6.1.6", text: "Failure to distribute, remit or report to the Company monies or equivalent financial value received from clients or their representative", penalty: "Review for Termination" },
          { code: "6.1.7", text: "Providing false or misleading information during hiring process, throughout employment or to gain any company-provided preference or benefit", penalty: "Review for Termination" },
          { code: "6.1.8", text: "Providing false or misleading information or concealing material facts during an investigation or willful concealment or destruction of evidence", penalty: "Review for Termination" }
        ]
      },
      {
        code: "6.2",
        title: "Workplace Related Deception/Dishonesty/Fraud",
        items: [
          { code: "6.2.1", text: "Work-related cheating", penalty: "Review for Termination" },
          { code: "6.2.2", text: "Misrepresentation of Data", penalty: "Review for Termination" },
          { code: "6.2.3", text: "Data Manipulation, Fabrication/Forgery", penalty: "Review for Termination" },
          { code: "6.2.4", text: "Unauthorized diversion or application of Company funds", penalty: "Review for Termination" },
          { code: "6.2.5", text: "Misrepresenting, forging or falsifying personal or Company or client documents, records, reports and papers", penalty: "Review for Termination" },
          { code: "6.2.6", text: "Forging or falsifying submitted medical document or fit to work", penalty: "Review for Termination" },
          { code: "6.2.7", text: "Obtaining Company supplies or equipment through fraudulent means, whether independently or in collusion or in connivance with another employee, Company directors, representatives, agents, suppliers, vendor, visitors and clients", penalty: "Review for Termination" }
        ]
      }
    ]
  },
  {
    category: "7. Attendance Discipline",
    subsections: [
      {
        code: "7.0",
        title: "Attendance Violations",
        items: [
          { code: "7.1", text: "Tardiness", penalty: "CAP 0" },
          { code: "7.2", text: "Unauthorized undertime or extended break", penalty: "CAP 0" },
          { code: "7.3", text: "Unauthorized Absence — Absence without prior approval received from the immediate supervisor", penalty: "CAP 1" },
          { code: "7.3.1", text: "Absence without prior approval received from the immediate supervisor", penalty: "CAP 1" },
          { code: "7.3.2", text: "Failure to provide notification to the immediate supervisor within a two (2) to four (4) hour period before the start of the employee's shift, and to furnish a valid reason for the absence", penalty: "CAP 1" },
          { code: "7.4", text: "No call No show", penalty: "CAP 2" },
          { code: "7.5", text: "Absence on identified critical workdays", penalty: "CAP 2" },
          { code: "7.6", text: "Absconding for three (3) or more days", penalty: "Review for Termination" }
        ]
      }
    ]
  }
];
