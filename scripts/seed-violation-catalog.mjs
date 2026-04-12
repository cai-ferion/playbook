/**
 * Seed compass_violation_catalog from GPHR Policy v3.0 (Feb 2026)
 * Run: node scripts/seed-violation-catalog.mjs
 */
import mysql from "mysql2/promise";

const violations = [
  // Category 1: Misconduct - Basic Discipline
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.1", code: "1.1.1", text: "Non-observance of dress code policy", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.2", code: "1.1.2", text: "Eating/drinking in non-designated areas", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.3", code: "1.1.3", text: "Non-observance of facility policies (e.g., smoking in non-designated areas)", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.4", code: "1.1.4", text: "Littering or failure to maintain cleanliness in work area", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.5", code: "1.1.5", text: "Improper use of company communication channels", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.6", code: "1.1.6", text: "Other analogous minor violations of basic discipline", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.7", code: "1.1.7", text: "Non-completion of mandatory courses/trainings within prescribed period", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.8", code: "1.1.8", text: "Sleeping during work hours or on company premises", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.9", code: "1.1.9", text: "Carelessness or negligence in the performance of duties", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 1, catName: "Misconduct - Basic Discipline", sub: "1.1.10", code: "1.1.10", text: "Other analogous minor violations punishable by CAP 1", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },

  // Category 2: Misconduct - On Facilities and Workplace Standards
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.1", code: "2.1.1", text: "Failure to wear or display ID card while on company premises", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.2", code: "2.1.2", text: "Loitering in unauthorized areas during work hours", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.3", code: "2.1.3", text: "Violation of security protocols and procedures", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.4", code: "2.1.4", text: "Tailgating or allowing unauthorized entry", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.5", code: "2.1.5", text: "Bringing personal electronic equipment to production floor without authorization", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.6", code: "2.1.6", text: "Concealment of prohibited items on company premises", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.7", code: "2.1.7", text: "Disregard of official notices, memoranda, or directives", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.8", code: "2.1.8", text: "Willful disregard of office directives or instructions from management", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.9", code: "2.1.9", text: "Unauthorized removal of company equipment or devices from premises", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.10", code: "2.1.10", text: "Non-observance of sanitation and hygiene standards", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.11", code: "2.1.11", text: "Refusal to undergo required physical examination", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.12", code: "2.1.12", text: "Bringing prohibited items to company premises", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.13", code: "2.1.13", text: "Lending or borrowing of company ID for unauthorized purposes", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.14", code: "2.1.14", text: "Unauthorized access to restricted areas", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.15", code: "2.1.15", text: "Subversion of security systems or protocols", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.16", code: "2.1.16", text: "Possession of firearms or deadly weapons on company premises", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.17", code: "2.1.17", text: "Forcible entry into company premises or restricted areas", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 2, catName: "Misconduct - On Facilities and Workplace Standards", sub: "2.1.18", code: "2.1.18", text: "Vandalism or willful destruction of company property", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },

  // Category 3: Misconduct - Performance and Work Code Standards
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.1", code: "3.1.1", text: "Failure to meet production/quality standards per account escalation matrix (Low/Medium/High Risk)", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.2", code: "3.1.2", text: "Engaging in non-productive work during work hours", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.3", code: "3.1.3", text: "Unnecessary conversation or socializing that disrupts work", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.4", code: "3.1.4", text: "Work avoidance or deliberate slowdown", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.5", code: "3.1.5", text: "Disrupting productivity of other employees", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.6", code: "3.1.6", text: "Unethical work practices", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.7", code: "3.1.7", text: "Inappropriate remarks or comments in professional setting", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.8", code: "3.1.8", text: "Abuse of call hold or auxiliary time", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.9", code: "3.1.9", text: "Deliberate call dropping or disconnection", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.10", code: "3.1.10", text: "Tampering with hardware or software systems", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.11", code: "3.1.11", text: "Unauthorized transfer or routing of work", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.12", code: "3.1.12", text: "Direct customer contact outside authorized channels", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 3, catName: "Misconduct - Performance and Work Code Standards", sub: "3.1.13", code: "3.1.13", text: "Misuse of authority or position in work processes", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },

  // Category 4: Misconduct - IT Infrastructure, Data Privacy and Controllership
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.1", code: "4.1.1", text: "Bringing storage devices to production floor", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.2", code: "4.1.2", text: "Violation of clean desk policy", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.3", code: "4.1.3", text: "Violation of Information Security policies", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.4", code: "4.1.4", text: "Violation of Social Media policies", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.5", code: "4.1.5", text: "Violation of Data Privacy policies", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.6", code: "4.1.6", text: "Violation of Remote Working policies", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.7", code: "4.1.7", text: "Unauthorized use of mobile phone on production floor", cap: "CAP 1 up to RT", min: 1, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.8", code: "4.1.8", text: "Misuse of internet access for non-work purposes", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.9", code: "4.1.9", text: "Taking photos or videos of production floor or work materials", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.10", code: "4.1.10", text: "Connecting unauthorized storage devices to company systems", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.11", code: "4.1.11", text: "Unauthorized disclosure of confidential information", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.12", code: "4.1.12", text: "Unauthorized reproduction of company documents or data", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.13", code: "4.1.13", text: "Sending company data to personal email accounts", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.14", code: "4.1.14", text: "Posting confidential information on social media", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.15", code: "4.1.15", text: "Unauthorized access to or tampering with company systems", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.16", code: "4.1.16", text: "Breach of personal information confidentiality", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.1.17", code: "4.1.17", text: "Password sharing or mishandling of access credentials", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  // 4.2 Controllership
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.1", code: "4.2.1", text: "Violation of gift and entertainment policy", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.2", code: "4.2.2", text: "Violation of charitable giving policy", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.3", code: "4.2.3", text: "Misuse of corporate card", cap: "CAP 2 up to RT", min: 2, max: 4, nte: true, hearing: false, nteHrs: 48 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.4", code: "4.2.4", text: "Cash advance misuse or non-liquidation", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.5", code: "4.2.5", text: "Travel and lodging policy violations", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 4, catName: "Misconduct - IT Infrastructure, Data Privacy and Controllership", sub: "4.2.6", code: "4.2.6", text: "Fraudulent expense claims", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },

  // Category 5: Misconduct - Improper Actions, Ethics and Activity
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.1", code: "5.1.1", text: "Non-observance of company policy or procedure", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.2", code: "5.1.2", text: "Negligence in the performance of duties", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.3", code: "5.1.3", text: "Failure to report issues or incidents to management", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.4", code: "5.1.4", text: "Delayed assessment or processing of work", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.5", code: "5.1.5", text: "Appraisal or evaluation issues", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.6", code: "5.1.6", text: "Non-adherence to Performance Improvement Plan", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.7", code: "5.1.7", text: "Failure to submit required medical certificates", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.8", code: "5.1.8", text: "Delayed exit processing", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.9", code: "5.1.9", text: "Negligent handling of records or documents", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.10", code: "5.1.10", text: "Providing inaccurate information during hiring process", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.11", code: "5.1.11", text: "Failure to enforce company policies as a supervisor", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.12", code: "5.1.12", text: "Negligent mistakes resulting in significant impact to company", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.1.13", code: "5.1.13", text: "Failure to disclose criminal involvement", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  // 5.2 Violations against Morals
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.1", code: "5.2.1", text: "Conduct detrimental to company image or reputation", cap: "CAP 3", min: 3, max: 3, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.2", code: "5.2.2", text: "Discourtesy or disrespectful behavior toward clients or colleagues", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.3", code: "5.2.3", text: "Actions detrimental to client relationship", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.4", code: "5.2.4", text: "Gambling on company premises", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.5", code: "5.2.5", text: "Spreading gossip or malicious rumors", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.6", code: "5.2.6", text: "Refusal to return company property", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.7", code: "5.2.7", text: "Violation of anti-corruption policies", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.8", code: "5.2.8", text: "Work abandonment without proper notice", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.9", code: "5.2.9", text: "Restricting output or encouraging others to do so", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.10", code: "5.2.10", text: "Disparagement of company or its representatives", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.11", code: "5.2.11", text: "Insubordination or refusal to follow lawful orders", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.12", code: "5.2.12", text: "Logging time or attendance for another employee", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.13", code: "5.2.13", text: "Abuse of position or authority", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.14", code: "5.2.14", text: "Unauthorized work stoppage or slowdown", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.15", code: "5.2.15", text: "Accepting money or gifts from clients or vendors", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.16", code: "5.2.16", text: "Conviction of crime involving moral turpitude", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.2.17", code: "5.2.17", text: "Sabotage of company operations or property", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  // 5.3 Conflicts of Interest
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.1", code: "5.3.1", text: "Conflict of interest with company business", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.2", code: "5.3.2", text: "Soliciting or selling within company premises without authorization", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.3", code: "5.3.3", text: "Breach of confidentiality agreement", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.4", code: "5.3.4", text: "Moonlighting or unauthorized outside employment", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.5", code: "5.3.5", text: "Employment exchange or referral for personal gain", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.3.6", code: "5.3.6", text: "Lending with conflict of interest", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  // 5.4 Violations against Persons
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.1", code: "5.4.1", text: "Use of profanity or offensive language", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.2", code: "5.4.2", text: "Attempted bodily harm against another person", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.3", code: "5.4.3", text: "Harassment of any form", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.4", code: "5.4.4", text: "Bullying or intimidating behavior", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.5", code: "5.4.5", text: "Inappropriate behavior toward colleagues", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.6", code: "5.4.6", text: "Inappropriate physical conduct or spreading gossip about colleagues", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.7", code: "5.4.7", text: "Abuse of authority over subordinates", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.8", code: "5.4.8", text: "Sexual harassment", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.9", code: "5.4.9", text: "Other analogous violations against persons", cap: "CAP 3 up to RT", min: 3, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.10", code: "5.4.10", text: "Threats or intimidation against any person", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 5, catName: "Misconduct - Improper Actions, Ethics and Activity", sub: "5.4.11", code: "5.4.11", text: "Criminal conviction for crimes against persons", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },

  // Category 6: Misconduct - Fraud/Deception/Dishonesty
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.1", code: "6.1.1", text: "Unauthorized access to confidential records for personal gain", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.2", code: "6.1.2", text: "Revealing confidential information to unauthorized parties", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.3", code: "6.1.3", text: "Modifying or tampering with official records", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.4", code: "6.1.4", text: "Soliciting customers or business for personal benefit", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.5", code: "6.1.5", text: "Misappropriation of company funds or property", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.6", code: "6.1.6", text: "Failure to remit company funds", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.7", code: "6.1.7", text: "Providing false information to the company", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.1.8", code: "6.1.8", text: "Concealing evidence relevant to company investigations", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.1", code: "6.2.1", text: "Cheating in examinations or assessments", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.2", code: "6.2.2", text: "Data misrepresentation", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.3", code: "6.2.3", text: "Data manipulation, forgery, or falsification", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.4", code: "6.2.4", text: "Unauthorized diversion of company funds", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.5", code: "6.2.5", text: "Falsifying official documents", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.6", code: "6.2.6", text: "Falsifying medical documents or certificates", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
  { cat: 6, catName: "Misconduct - Fraud/Deception/Dishonesty", sub: "6.2.7", code: "6.2.7", text: "Fraudulent use of company equipment or resources", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },

  // Category 7: Attendance Discipline
  { cat: 7, catName: "Attendance Discipline", sub: "7.1", code: "7.1", text: "Tardiness - Failure to report at scheduled shift start time", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 7, catName: "Attendance Discipline", sub: "7.2", code: "7.2", text: "Unauthorized undertime or extended break", cap: "CAP 0", min: 0, max: 0, nte: false, hearing: false, nteHrs: 0 },
  { cat: 7, catName: "Attendance Discipline", sub: "7.3", code: "7.3", text: "Unauthorized Absence - No prior approval or no notification 2-4 hours before shift", cap: "CAP 1", min: 1, max: 1, nte: true, hearing: false, nteHrs: 48 },
  { cat: 7, catName: "Attendance Discipline", sub: "7.4", code: "7.4", text: "No Call No Show - Failure to notify supervisor before or during scheduled shift", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 7, catName: "Attendance Discipline", sub: "7.5", code: "7.5", text: "Absence on critical workdays", cap: "CAP 2", min: 2, max: 2, nte: true, hearing: false, nteHrs: 48 },
  { cat: 7, catName: "Attendance Discipline", sub: "7.6", code: "7.6", text: "Absconding - 3 or more consecutive days of absence without notice", cap: "RT", min: 4, max: 4, nte: true, hearing: true, nteHrs: 120 },
];

async function seed() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Clear existing data
  await conn.execute("DELETE FROM compass_violation_catalog");

  // Insert all violations
  const insertSQL = `INSERT INTO compass_violation_catalog
    (category_number, category_name, subsection, violation_code, violation_text, recommended_cap, min_cap_level, max_cap_level, requires_nte, requires_hearing, nte_response_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let count = 0;
  for (const v of violations) {
    await conn.execute(insertSQL, [
      v.cat, v.catName, v.sub, v.code, v.text, v.cap,
      v.min, v.max, v.nte, v.hearing, v.nteHrs,
    ]);
    count++;
  }

  console.log(`Seeded ${count} violations into compass_violation_catalog.`);
  await conn.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
