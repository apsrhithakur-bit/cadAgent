import { PatentResult, PatentSearchParams } from './patentSearch'

// Mock data generation functions for development - HIGHLY DIVERSE REALISTIC DATA
export function generateGooglePatentsMockData(params: PatentSearchParams): PatentResult[] {
  console.log('🎭 Generating highly diverse Google Patents mock data for:', params.query)
  
  // Extract core product from query for more realistic mock data
  const coreProduct = params.query
    .replace(/^"?(.+?)"?\s*(mechanical|component|device|system|assembly|part).*$/i, '$1')
    .replace(/['"]/g, '')
    .trim() || 'mechanical device'
  
  const mockPatents: PatentResult[] = []
  const numResults = Math.min(params.limit || 5, 5)
  
  // More diverse companies and inventors
  const companies = [
    'Bosch Rexroth Corporation', 'Siemens AG', 'General Electric Company', 
    'Honeywell International Inc.', 'Schneider Electric', 'Parker Hannifin Corporation',
    'Emerson Electric Co.', 'ABB Ltd.', 'Rockwell Automation Inc.'
  ]
  const inventors = [
    'Michael J. Thompson', 'Sarah L. Chen', 'David R. Martinez', 
    'Jennifer K. Wilson', 'Robert A. Johnson', 'Lisa M. Anderson',
    'James P. Brown', 'Maria S. Garcia', 'Thomas E. Davis'
  ]
  
  // Highly diverse title patterns with random variations
  const titleBases = [
    `Advanced ${coreProduct.toLowerCase()} system with intelligent control`,
    `High-performance ${coreProduct.toLowerCase()} assembly for automotive applications`,
    `Precision-engineered ${coreProduct.toLowerCase()} with vibration dampening`,
    `Lightweight ${coreProduct.toLowerCase()} design using composite materials`,
    `Self-monitoring ${coreProduct.toLowerCase()} with predictive maintenance`,
    `Aerodynamic ${coreProduct.toLowerCase()} configuration for improved efficiency`,
    `Magnetic levitation ${coreProduct.toLowerCase()} bearing system`,
    `Smart ${coreProduct.toLowerCase()} with wireless connectivity`,
    `Hybrid ${coreProduct.toLowerCase()} incorporating regenerative technology`,
    `Modular ${coreProduct.toLowerCase()} platform with quick-change capability`
  ]
  
  // Generate unique technical variations for each result
  const technicalVariations = [
    'with integrated sensor arrays and real-time feedback control',
    'featuring adaptive geometry and variable stiffness characteristics',
    'incorporating nano-structured surface treatments for enhanced durability',
    'with electromagnetic actuators and precision positioning systems',
    'featuring biomimetic design principles and self-healing materials',
    'with advanced thermal management and cooling systems',
    'incorporating machine learning algorithms for performance optimization',
    'featuring modular construction and rapid reconfiguration capability',
    'with active vibration control and noise reduction technology',
    'incorporating sustainable materials and energy-efficient operation'
  ]
  
  // Highly diverse abstracts with technical specificity
  const abstractBases = [
    `The present invention discloses a novel ${coreProduct.toLowerCase()} system that addresses critical performance limitations in current technology. Through innovative mechanical design and advanced materials engineering, the disclosed apparatus achieves significant improvements in operational efficiency and reliability.`,
    `This patent describes a revolutionary approach to ${coreProduct.toLowerCase()} design that integrates cutting-edge manufacturing techniques with intelligent control systems. The invention enables unprecedented levels of precision and performance in demanding industrial environments.`,
    `Disclosed herein is an advanced ${coreProduct.toLowerCase()} configuration that incorporates multiple technological innovations to overcome traditional design constraints. The system features enhanced durability, reduced maintenance requirements, and superior operational characteristics.`,
    `The invention relates to a sophisticated ${coreProduct.toLowerCase()} apparatus that combines traditional mechanical principles with modern smart technology. Key innovations include adaptive control algorithms, predictive maintenance capabilities, and optimized energy consumption patterns.`,
    `This patent presents a groundbreaking ${coreProduct.toLowerCase()} design that leverages advanced computational modeling and precision manufacturing to achieve superior performance metrics. The disclosed system offers significant advantages in efficiency, reliability, and cost-effectiveness.`
  ]
  
  for (let i = 0; i < numResults; i++) {
    const patentNumber = `US${Math.floor(Math.random() * 1000000 + 9500000)}`
    const year = 2019 + Math.floor(Math.random() * 5)
    const month = Math.floor(Math.random() * 12) + 1
    const day = Math.floor(Math.random() * 28) + 1
    
    // Create unique combinations for each patent
    const titleBase = titleBases[Math.floor(Math.random() * titleBases.length)]
    const techVariation = technicalVariations[Math.floor(Math.random() * technicalVariations.length)]
    const abstractBase = abstractBases[Math.floor(Math.random() * abstractBases.length)]
    
    // Generate unique title by combining base + variation
    const uniqueTitle = `${titleBase} ${techVariation}`
    
    // Generate detailed technical abstract
    const technicalDetails = [
      'utilizing advanced finite element analysis',
      'with optimized material distribution patterns',
      'featuring proprietary surface coating technology',
      'incorporating real-time performance monitoring',
      'with integrated failure prediction algorithms',
      'featuring multi-axis actuation systems',
      'utilizing hybrid composite construction',
      'with adaptive response characteristics'
    ]
    
    const selectedDetail = technicalDetails[Math.floor(Math.random() * technicalDetails.length)]
    const uniqueAbstract = `${abstractBase} The disclosed system incorporates ${selectedDetail} to achieve superior performance characteristics not found in prior art solutions.`
    
    // Generate realistic classification codes
    const classificationGroups = [
      [`F16H${21 + i}/00`, `B60B${3 + i}/04`],
      [`B25J${15 + i}/00`, `G05B${19 + i}/02`],
      [`F16C${17 + i}/00`, `B62D${7 + i}/06`],
      [`B23Q${1 + i}/00`, `G01M${17 + i}/02`],
      [`F01N${13 + i}/00`, `B60K${6 + i}/04`]
    ]
    
    mockPatents.push({
      id: `google-mock-${patentNumber}`,
      patentNumber,
      title: uniqueTitle,
      inventor: inventors[Math.floor(Math.random() * inventors.length)],
      assignee: companies[Math.floor(Math.random() * companies.length)],
      filingDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      publicationDate: `${year + 1}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      grantDate: i < 3 ? `${year + 2}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}` : undefined,
      status: i < 3 ? 'active' : i === 3 ? 'pending' : 'active',
      abstract: uniqueAbstract,
      classification: classificationGroups[i % classificationGroups.length],
      country: 'US',
      matchScore: 0, // Will be calculated by real similarity analysis
      url: `https://patents.google.com/patent/${patentNumber}`,
      source: 'google',
      riskLevel: 'medium' // Will be calculated by real risk analysis
    })
  }
  
  return mockPatents
}

export function generateUSPTOMockData(params: PatentSearchParams): PatentResult[] {
  console.log('🎭 Generating realistic USPTO mock data for:', params.query)
  
  // Extract core product from query for more realistic mock data  
  const coreProduct = params.query
    .replace(/^"?(.+?)"?\s*(mechanical|component|device|system|assembly|part).*$/i, '$1')
    .replace(/['"]/g, '')
    .trim() || 'mechanical device'
  
  const mockPatents: PatentResult[] = []
  const numResults = Math.min(params.limit || 3, 3)
  
  // More diverse USPTO assignees
  const companies = [
    'Caterpillar Inc.', 'General Motors Company', 'Ford Global Technologies LLC',
    'Boeing Company', 'Lockheed Martin Corporation', 'Raytheon Technologies Corporation',
    '3M Innovative Properties Company', 'Dow Global Technologies LLC'
  ]
  const inventors = [
    'Robert W. Johnson', 'Patricia L. Williams', 'Charles M. Brown', 
    'Linda F. Davis', 'Christopher R. Miller', 'Michelle A. Wilson'
  ]
  
  // USPTO-style title bases (more formal and diverse)
  const titleBases = [
    `System and method for ${coreProduct.toLowerCase()} control and monitoring`,
    `${coreProduct} apparatus with integrated feedback mechanism`,
    `Process for manufacturing ${coreProduct.toLowerCase()} with enhanced properties`,
    `${coreProduct} system with adaptive performance optimization`,
    `Method of operating ${coreProduct.toLowerCase()} with improved reliability`,
    `Apparatus for precision ${coreProduct.toLowerCase()} positioning and control`,
    `Multi-stage ${coreProduct.toLowerCase()} assembly with variable characteristics`,
    `Computer-controlled ${coreProduct.toLowerCase()} manufacturing system`,
    `Hybrid ${coreProduct.toLowerCase()} design with energy recovery capability`,
    `Automated inspection system for ${coreProduct.toLowerCase()} quality assurance`
  ]
  
  // USPTO-style technical modifiers
  const technicalModifiers = [
    'utilizing electromagnetic field manipulation',
    'with real-time adaptive control algorithms',
    'featuring distributed sensor networks',
    'incorporating machine learning optimization',
    'with self-diagnostic and repair capabilities',
    'utilizing advanced materials science principles',
    'featuring modular architecture and scalability',
    'with integrated safety and monitoring systems',
    'incorporating predictive maintenance protocols',
    'utilizing precision manufacturing techniques'
  ]
  
  // USPTO-style abstract bases (more technical and formal)
  const abstractBases = [
    `A system for ${coreProduct.toLowerCase()} comprises a control unit, sensor array, and processing module configured to optimize operational parameters. The disclosed method enables real-time adjustment of system variables to maintain optimal performance under varying operational conditions.`,
    `The present invention provides a ${coreProduct.toLowerCase()} apparatus featuring novel mechanical arrangements that improve operational efficiency by at least 15% compared to conventional designs. The invention includes specialized components for enhanced durability and reduced maintenance requirements.`,
    `Disclosed herein is a method for operating a ${coreProduct.toLowerCase()} system that utilizes predictive algorithms to anticipate operational needs. The system incorporates sensor feedback loops and automated adjustment mechanisms to maintain consistent performance across diverse operating environments.`,
    `A ${coreProduct.toLowerCase()} device includes a monitoring subsystem configured to detect operational anomalies and automatically implement corrective measures. The invention significantly reduces downtime and extends operational lifespan through proactive maintenance protocols.`,
    `The invention relates to a manufacturing process for ${coreProduct.toLowerCase()} components that achieves superior material properties through controlled processing parameters. The disclosed method produces components with enhanced strength and reduced weight characteristics.`,
    `This patent describes a novel ${coreProduct.toLowerCase()} configuration that addresses fundamental limitations in existing technology through innovative engineering solutions. The disclosed apparatus provides significant performance improvements while maintaining cost-effectiveness and manufacturability.`
  ]
  
  for (let i = 0; i < numResults; i++) {
    const patentNumber = `US${Math.floor(Math.random() * 1000000 + 8500000)}`
    const year = 2018 + Math.floor(Math.random() * 6)
    const month = Math.floor(Math.random() * 12) + 1
    const day = Math.floor(Math.random() * 28) + 1
    
    // Create unique combinations for each USPTO patent
    const titleBase = titleBases[Math.floor(Math.random() * titleBases.length)]
    const techModifier = technicalModifiers[Math.floor(Math.random() * technicalModifiers.length)]
    const abstractBase = abstractBases[Math.floor(Math.random() * abstractBases.length)]
    
    // Generate unique USPTO-style title
    const uniqueTitle = `${titleBase} ${techModifier}`
    
    // Generate detailed USPTO-style abstract
    const processDetails = [
      'The disclosed methodology incorporates advanced computational fluid dynamics',
      'Implementation involves proprietary algorithms for stress distribution analysis',
      'The system utilizes real-time data acquisition and processing capabilities',
      'Key innovations include adaptive control mechanisms and feedback systems',
      'The apparatus features integrated quality assurance and validation protocols',
      'Advanced material characterization techniques ensure optimal performance'
    ]
    
    const selectedProcess = processDetails[Math.floor(Math.random() * processDetails.length)]
    const uniqueAbstract = `${abstractBase} ${selectedProcess} to provide enhanced functionality and reliability compared to conventional approaches.`
    
    // Generate diverse USPTO classification codes
    const usptoClassifications = [
      [`F16H${25 + i}/00`, `B62D${5 + i}/04`, `G01M${15 + i}/02`],
      [`B23Q${3 + i}/00`, `G05B${23 + i}/02`, `F16C${19 + i}/00`],
      [`F01N${17 + i}/00`, `B60K${8 + i}/04`, `G01N${33 + i}/20`],
      [`B25J${13 + i}/00`, `G06F${17 + i}/50`, `F16D${48 + i}/02`],
      [`F02D${41 + i}/00`, `B60W${30 + i}/18`, `G07C${5 + i}/08`]
    ]
    
    mockPatents.push({
      id: `uspto-mock-${patentNumber}`,
      patentNumber,
      title: uniqueTitle,
      inventor: inventors[Math.floor(Math.random() * inventors.length)],
      assignee: companies[Math.floor(Math.random() * companies.length)],
      filingDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      publicationDate: `${year + 1}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      grantDate: i < 2 ? `${year + 2}-${(month + 3).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}` : undefined,
      status: i < 2 ? 'active' : 'pending',
      abstract: uniqueAbstract,
      classification: usptoClassifications[i % usptoClassifications.length],
      country: 'US',
      matchScore: 0, // Will be calculated by real similarity analysis
      url: `https://patents.uspto.gov/patent/${patentNumber}`,
      source: 'uspto',
      riskLevel: 'medium' // Will be calculated by real risk analysis
    })
  }
  
  return mockPatents
}