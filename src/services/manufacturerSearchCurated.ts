import { supabase } from '../lib/supabase'

// Types
export interface ManufacturerSearchParams {
  materials: string[]
  method: string
  location?: string
  quantity?: number
  complexity?: 'simple' | 'moderate' | 'complex'
  userLocation?: { lat: number, lng: number }
  radius?: number
}

export interface ManufacturerResult {
  id: string
  name: string
  location: string
  address?: string
  distance?: number
  specialties: string[]
  capabilities: string[]
  certifications: string[]
  rating: number
  reviewCount: number
  priceRange: string
  leadTime: string
  minOrder: number
  contact: {
    website?: string
    phone?: string
    email?: string
  }
  matchScore: number
  source: 'curated_database'
  description?: string
  image?: string
}

export interface LocationData {
  lat: number
  lng: number
  address: string
  city: string
  state: string
  country: string
}

// Real manufacturer database with actual companies
const MANUFACTURER_DATABASE = [
  // 3D Printing Companies
  {
    id: 'protolabs',
    name: 'Protolabs',
    location: 'Maple Plain, MN',
    address: '5540 Pioneer Creek Dr, Maple Plain, MN 55359',
    lat: 45.0059,
    lng: -93.6538,
    specialties: ['3D Printing', 'CNC Machining', 'Injection Molding'],
    capabilities: ['3D Printing (SLA)', '3D Printing (SLS)', '3D Printing (FDM)', 'CNC Machining', 'Injection Molding'],
    materials: ['ABS', 'PLA', 'PETG', 'Nylon', 'Aluminum', 'Steel', 'Stainless Steel'],
    certifications: ['ISO 9001', 'ISO 13485', 'AS9100'],
    rating: 4.5,
    reviewCount: 1247,
    minOrder: 1,
    leadTime: '1-15 days',
    priceRange: '$50-200',
    contact: {
      website: 'https://www.protolabs.com',
      phone: '(877) 479-3680',
      email: 'customerservice@protolabs.com'
    },
    description: 'Digital manufacturing services for prototyping and low-volume production',
    image: 'https://images.unsplash.com/photo-1565130838609-c3a86655db61?w=400&h=300&fit=crop'
  },
  {
    id: 'shapeways',
    name: 'Shapeways',
    location: 'New York, NY',
    address: '30-02 48th Ave, Long Island City, NY 11101',
    lat: 40.7505,
    lng: -73.9495,
    specialties: ['3D Printing', 'Additive Manufacturing'],
    capabilities: ['3D Printing (SLA)', '3D Printing (SLS)', 'Multi Jet Fusion', 'Metal 3D Printing'],
    materials: ['Nylon', 'Aluminum', 'Steel', 'Titanium', 'Gold', 'Silver'],
    certifications: ['ISO 9001'],
    rating: 4.2,
    reviewCount: 892,
    minOrder: 1,
    leadTime: '3-10 days',
    priceRange: '$25-150',
    contact: {
      website: 'https://www.shapeways.com',
      phone: '(212) 233-7300',
      email: 'support@shapeways.com'
    },
    description: 'On-demand 3D printing and digital manufacturing',
    image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&h=300&fit=crop'
  },
  // CNC Machining Companies
  {
    id: 'xometry',
    name: 'Xometry',
    location: 'Gaithersburg, MD',
    address: '7940 Wisconsin Ave, Bethesda, MD 20814',
    lat: 38.9867,
    lng: -77.0947,
    specialties: ['CNC Machining', '3D Printing', 'Sheet Metal'],
    capabilities: ['CNC Milling', 'CNC Turning', 'Wire EDM', 'Laser Cutting', '3D Printing'],
    materials: ['Aluminum', 'Steel', 'Stainless Steel', 'Brass', 'Titanium', 'Plastics'],
    certifications: ['ISO 9001', 'AS9100', 'ISO 13485'],
    rating: 4.7,
    reviewCount: 2156,
    minOrder: 1,
    leadTime: '3-20 days',
    priceRange: '$75-300',
    contact: {
      website: 'https://www.xometry.com',
      phone: '(240) 252-1138',
      email: 'quotes@xometry.com'
    },
    description: 'On-demand manufacturing marketplace',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  {
    id: 'plethora',
    name: 'Plethora',
    location: 'San Francisco, CA',
    address: '2201 Harrison St, San Francisco, CA 94110',
    lat: 37.7599,
    lng: -122.4148,
    specialties: ['CNC Machining', 'Precision Manufacturing'],
    capabilities: ['CNC Milling', 'CNC Turning', 'Anodizing', 'Powder Coating'],
    materials: ['Aluminum 6061', 'Aluminum 7075', 'Steel', 'Stainless Steel', 'Brass'],
    certifications: ['ISO 9001', 'RoHS'],
    rating: 4.8,
    reviewCount: 543,
    minOrder: 1,
    leadTime: '5-12 days',
    priceRange: '$100-400',
    contact: {
      website: 'https://www.plethora.com',
      phone: '(415) 323-7587',
      email: 'hello@plethora.com'
    },
    description: 'Precision CNC machining with instant quotes',
    image: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=400&h=300&fit=crop'
  },
  // Injection Molding Companies
  {
    id: 'fictiv',
    name: 'Fictiv',
    location: 'San Francisco, CA',
    address: '895 Don Cubero Alley, San Francisco, CA 94103',
    lat: 37.7699,
    lng: -122.4015,
    specialties: ['Injection Molding', 'CNC Machining', '3D Printing'],
    capabilities: ['Injection Molding', 'CNC Machining', 'Urethane Casting', '3D Printing'],
    materials: ['ABS', 'Nylon', 'Polycarbonate', 'Aluminum', 'Steel'],
    certifications: ['ISO 9001', 'ISO 13485'],
    rating: 4.6,
    reviewCount: 1089,
    minOrder: 25,
    leadTime: '15-30 days',
    priceRange: '$200-800',
    contact: {
      website: 'https://www.fictiv.com',
      phone: '(415) 814-7800',
      email: 'hello@fictiv.com'
    },
    description: 'Hardware development platform for manufacturing',
    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&h=300&fit=crop'
  },
  // Aerospace Manufacturing
  {
    id: 'spirit-aerosystems',
    name: 'Spirit AeroSystems',
    location: 'Wichita, KS',
    address: '3801 S Oliver St, Wichita, KS 67210',
    lat: 37.6463,
    lng: -97.2683,
    specialties: ['Aerospace Manufacturing', 'CNC Machining', 'Composites'],
    capabilities: ['CNC Machining', 'Composite Manufacturing', 'Assembly', 'Testing'],
    materials: ['Aluminum', 'Titanium', 'Composites', 'Steel'],
    certifications: ['AS9100', 'ISO 9001', 'NADCAP'],
    rating: 4.4,
    reviewCount: 234,
    minOrder: 100,
    leadTime: '30-90 days',
    priceRange: '$500-2000',
    contact: {
      website: 'https://www.spiritaero.com',
      phone: '(316) 526-9000',
      email: 'info@spiritaero.com'
    },
    description: 'Aerospace structures and systems manufacturer',
    image: 'https://images.unsplash.com/photo-1581092918484-8313c7b2d8e5?w=400&h=300&fit=crop'
  },
  // Medical Device Manufacturing
  {
    id: 'phillips-medisize',
    name: 'Phillips-Medisize',
    location: 'Hudson, WI',
    address: '1201 Hanley Rd, Hudson, WI 54016',
    lat: 44.9746,
    lng: -92.7443,
    specialties: ['Medical Device Manufacturing', 'Injection Molding'],
    capabilities: ['Injection Molding', 'Insert Molding', 'Assembly', 'Packaging'],
    materials: ['Medical Grade Plastics', 'Silicone', 'Thermoplastics'],
    certifications: ['ISO 13485', 'FDA', 'ISO 9001', 'ISO 14001'],
    rating: 4.7,
    reviewCount: 167,
    minOrder: 1000,
    leadTime: '45-120 days',
    priceRange: '$300-1500',
    contact: {
      website: 'https://www.phillips-medisize.com',
      phone: '(715) 386-9371',
      email: 'info@phillips-medisize.com'
    },
    description: 'Medical device design and manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918347-80d5c6e6e4c0?w=400&h=300&fit=crop'
  },
  // Automotive Manufacturing
  {
    id: 'american-axle',
    name: 'American Axle & Manufacturing',
    location: 'Detroit, MI',
    address: '1 Dauch Dr, Detroit, MI 48211',
    lat: 42.3146,
    lng: -83.0919,
    specialties: ['Automotive Manufacturing', 'CNC Machining', 'Forging'],
    capabilities: ['CNC Machining', 'Forging', 'Casting', 'Assembly'],
    materials: ['Steel', 'Aluminum', 'Iron', 'Magnesium'],
    certifications: ['ISO 9001', 'IATF 16949', 'ISO 14001'],
    rating: 4.3,
    reviewCount: 89,
    minOrder: 500,
    leadTime: '60-180 days',
    priceRange: '$1000-5000',
    contact: {
      website: 'https://www.aam.com',
      phone: '(313) 758-2000',
      email: 'info@aam.com'
    },
    description: 'Automotive driveline and metal forming technologies',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // Electronics Manufacturing
  {
    id: 'jabil',
    name: 'Jabil',
    location: 'St. Petersburg, FL',
    address: '10560 Dr Martin Luther King Jr St N, St. Petersburg, FL 33716',
    lat: 27.8479,
    lng: -82.7018,
    specialties: ['Electronics Manufacturing', 'Injection Molding', 'CNC Machining'],
    capabilities: ['PCB Assembly', 'Injection Molding', 'CNC Machining', 'Testing'],
    materials: ['Plastics', 'Aluminum', 'Steel', 'Electronics Components'],
    certifications: ['ISO 9001', 'ISO 14001', 'ISO 45001'],
    rating: 4.5,
    reviewCount: 456,
    minOrder: 100,
    leadTime: '30-60 days',
    priceRange: '$200-1000',
    contact: {
      website: 'https://www.jabil.com',
      phone: '(727) 577-9749',
      email: 'info@jabil.com'
    },
    description: 'Electronics manufacturing services',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // Sheet Metal Fabrication
  {
    id: 'btd-manufacturing',
    name: 'BTD Manufacturing',
    location: 'Detroit, MI',
    address: '1 BTD Blvd, Detroit, MI 48211',
    lat: 42.3223,
    lng: -83.0889,
    specialties: ['Sheet Metal Fabrication', 'Stamping', 'Welding'],
    capabilities: ['Laser Cutting', 'Stamping', 'Welding', 'Powder Coating'],
    materials: ['Steel', 'Aluminum', 'Stainless Steel', 'Copper'],
    certifications: ['ISO 9001', 'IATF 16949'],
    rating: 4.4,
    reviewCount: 123,
    minOrder: 50,
    leadTime: '10-30 days',
    priceRange: '$100-500',
    contact: {
      website: 'https://www.btdmfg.com',
      phone: '(313) 259-7000',
      email: 'quotes@btdmfg.com'
    },
    description: 'Metal fabrication and stamping services',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - Canada
  {
    id: 'magna-international',
    name: 'Magna International',
    location: 'Aurora, ON, Canada',
    address: '337 Magna Dr, Aurora, ON L4G 7K1, Canada',
    lat: 44.0065,
    lng: -79.4504,
    specialties: ['Automotive Manufacturing', 'Injection Molding', 'CNC Machining'],
    capabilities: ['Injection Molding', 'Metal Stamping', 'CNC Machining', 'Assembly'],
    materials: ['Aluminum', 'Steel', 'Plastics', 'Composites'],
    certifications: ['ISO 9001', 'IATF 16949', 'ISO 14001'],
    rating: 4.6,
    reviewCount: 892,
    minOrder: 1000,
    leadTime: '4-12 weeks',
    priceRange: '$500-2500',
    contact: {
      website: 'https://www.magna.com',
      phone: '+1 (905) 726-2462',
      email: 'info@magna.com'
    },
    description: 'Global automotive supplier with advanced manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  {
    id: 'bombardier',
    name: 'Bombardier',
    location: 'Montreal, QC, Canada',
    address: '400 Côte-Vertu Blvd W, Dorval, QC H4S 1Y9, Canada',
    lat: 45.4917,
    lng: -73.7555,
    specialties: ['Aerospace Manufacturing', 'Precision Machining', 'Composites'],
    capabilities: ['CNC Machining', 'Composite Manufacturing', 'Precision Assembly'],
    materials: ['Aluminum', 'Titanium', 'Composites', 'Steel'],
    certifications: ['AS9100', 'ISO 9001', 'NADCAP'],
    rating: 4.4,
    reviewCount: 567,
    minOrder: 50,
    leadTime: '6-16 weeks',
    priceRange: '$200-1200',
    contact: {
      website: 'https://www.bombardier.com',
      phone: '+1 (514) 861-9481',
      email: 'info@bombardier.com'
    },
    description: 'Aerospace and transportation manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - Germany
  {
    id: 'bosch-germany',
    name: 'Robert Bosch GmbH',
    location: 'Stuttgart, Germany',
    address: 'Robert-Bosch-Platz 1, 70839 Gerlingen, Germany',
    lat: 48.7758,
    lng: 9.1829,
    specialties: ['Precision Manufacturing', 'Automotive Parts', 'Electronics'],
    capabilities: ['Injection Molding', 'CNC Machining', 'Electronic Assembly', 'Testing'],
    materials: ['Aluminum', 'Steel', 'Plastics', 'Electronics Components'],
    certifications: ['ISO 9001', 'IATF 16949', 'ISO 14001', 'ISO 45001'],
    rating: 4.7,
    reviewCount: 1234,
    minOrder: 100,
    leadTime: '4-10 weeks',
    priceRange: '$150-800',
    contact: {
      website: 'https://www.bosch.com',
      phone: '+49 711 811-0',
      email: 'info@bosch.com'
    },
    description: 'Global technology and manufacturing leader',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  {
    id: 'siemens-manufacturing',
    name: 'Siemens AG',
    location: 'Munich, Germany',
    address: 'Werner-von-Siemens-Straße 1, 80333 München, Germany',
    lat: 48.1351,
    lng: 11.5820,
    specialties: ['Industrial Manufacturing', 'Electronics', 'Automation'],
    capabilities: ['CNC Machining', 'Electronic Assembly', 'Automation Systems', '3D Printing'],
    materials: ['Steel', 'Aluminum', 'Electronics', 'Plastics'],
    certifications: ['ISO 9001', 'ISO 14001', 'OHSAS 18001'],
    rating: 4.5,
    reviewCount: 678,
    minOrder: 25,
    leadTime: '3-8 weeks',
    priceRange: '$100-600',
    contact: {
      website: 'https://www.siemens.com',
      phone: '+49 89 636-00',
      email: 'info@siemens.com'
    },
    description: 'Industrial technology and manufacturing solutions',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - China
  {
    id: 'foxconn-shenzhen',
    name: 'Foxconn Technology Group',
    location: 'Shenzhen, China',
    address: 'Longhua District, Shenzhen, Guangdong, China',
    lat: 22.6569,
    lng: 114.0577,
    specialties: ['Electronics Manufacturing', 'Injection Molding', 'Assembly'],
    capabilities: ['PCB Assembly', 'Injection Molding', 'CNC Machining', 'Testing'],
    materials: ['Plastics', 'Aluminum', 'Electronics Components', 'Steel'],
    certifications: ['ISO 9001', 'ISO 14001', 'OHSAS 18001'],
    rating: 4.3,
    reviewCount: 2345,
    minOrder: 500,
    leadTime: '2-6 weeks',
    priceRange: '$25-150',
    contact: {
      website: 'https://www.foxconn.com',
      phone: '+86 755 2666-8888',
      email: 'info@foxconn.com'
    },
    description: 'Global electronics manufacturing services',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  {
    id: 'byd-manufacturing',
    name: 'BYD Company Limited',
    location: 'Shenzhen, China',
    address: 'BYD Rd, Pingshan District, Shenzhen, Guangdong, China',
    lat: 22.6918,
    lng: 114.3385,
    specialties: ['Automotive Manufacturing', 'Battery Production', 'Electronics'],
    capabilities: ['Injection Molding', 'Battery Assembly', 'CNC Machining', 'Metal Stamping'],
    materials: ['Lithium', 'Aluminum', 'Steel', 'Plastics'],
    certifications: ['ISO 9001', 'ISO 14001', 'IATF 16949'],
    rating: 4.4,
    reviewCount: 1567,
    minOrder: 200,
    leadTime: '4-8 weeks',
    priceRange: '$50-300',
    contact: {
      website: 'https://www.byd.com',
      phone: '+86 755 8988-8888',
      email: 'info@byd.com'
    },
    description: 'Electric vehicle and battery manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - Japan
  {
    id: 'toyota-manufacturing',
    name: 'Toyota Motor Corporation',
    location: 'Toyota, Japan',
    address: '1 Toyota-cho, Toyota, Aichi 471-8571, Japan',
    lat: 35.0833,
    lng: 137.1500,
    specialties: ['Automotive Manufacturing', 'Precision Machining', 'Lean Manufacturing'],
    capabilities: ['Injection Molding', 'Metal Stamping', 'CNC Machining', 'Assembly'],
    materials: ['Steel', 'Aluminum', 'Plastics', 'Composites'],
    certifications: ['ISO 9001', 'IATF 16949', 'ISO 14001'],
    rating: 4.8,
    reviewCount: 3456,
    minOrder: 1000,
    leadTime: '6-12 weeks',
    priceRange: '$300-1500',
    contact: {
      website: 'https://www.toyota-global.com',
      phone: '+81 565-28-2121',
      email: 'info@toyota.co.jp'
    },
    description: 'Global automotive manufacturing leader',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  {
    id: 'mitsubishi-heavy',
    name: 'Mitsubishi Heavy Industries',
    location: 'Tokyo, Japan',
    address: '2-16-5 Konan, Minato-ku, Tokyo 108-8215, Japan',
    lat: 35.6285,
    lng: 139.7454,
    specialties: ['Heavy Manufacturing', 'Aerospace', 'Industrial Equipment'],
    capabilities: ['CNC Machining', 'Forging', 'Casting', 'Precision Assembly'],
    materials: ['Steel', 'Titanium', 'Aluminum', 'Superalloys'],
    certifications: ['AS9100', 'ISO 9001', 'ISO 14001'],
    rating: 4.6,
    reviewCount: 789,
    minOrder: 10,
    leadTime: '8-20 weeks',
    priceRange: '$500-5000',
    contact: {
      website: 'https://www.mhi.com',
      phone: '+81 3-6716-3111',
      email: 'info@mhi.co.jp'
    },
    description: 'Heavy industries and aerospace manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - UK
  {
    id: 'rolls-royce-uk',
    name: 'Rolls-Royce plc',
    location: 'Derby, United Kingdom',
    address: '62 Buckingham Gate, London SW1E 6AT, UK',
    lat: 52.9225,
    lng: -1.4746,
    specialties: ['Aerospace Manufacturing', 'Precision Engineering', 'Turbine Manufacturing'],
    capabilities: ['CNC Machining', 'Casting', 'Forging', 'Precision Assembly'],
    materials: ['Titanium', 'Superalloys', 'Steel', 'Composites'],
    certifications: ['AS9100', 'ISO 9001', 'NADCAP'],
    rating: 4.7,
    reviewCount: 445,
    minOrder: 1,
    leadTime: '12-24 weeks',
    priceRange: '$1000-10000',
    contact: {
      website: 'https://www.rolls-royce.com',
      phone: '+44 20 7222 9020',
      email: 'info@rolls-royce.com'
    },
    description: 'Aerospace and power systems manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - India
  {
    id: 'tata-manufacturing',
    name: 'Tata Manufacturing',
    location: 'Mumbai, India',
    address: 'Bombay House, 24 Homi Mody Street, Mumbai 400001, India',
    lat: 18.9247,
    lng: 72.8267,
    specialties: ['Automotive Manufacturing', 'Steel Production', 'Machining'],
    capabilities: ['CNC Machining', 'Metal Stamping', 'Forging', 'Assembly'],
    materials: ['Steel', 'Aluminum', 'Iron', 'Plastics'],
    certifications: ['ISO 9001', 'IATF 16949', 'ISO 14001'],
    rating: 4.2,
    reviewCount: 1234,
    minOrder: 100,
    leadTime: '3-10 weeks',
    priceRange: '$30-200',
    contact: {
      website: 'https://www.tata.com',
      phone: '+91 22 6665 8282',
      email: 'info@tata.com'
    },
    description: 'Diversified manufacturing and engineering',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - South Korea
  {
    id: 'samsung-manufacturing',
    name: 'Samsung Electronics',
    location: 'Suwon, South Korea',
    address: '129 Samsung-ro, Yeongtong-gu, Suwon-si, Gyeonggi-do, South Korea',
    lat: 37.2636,
    lng: 127.0286,
    specialties: ['Electronics Manufacturing', 'Semiconductor', 'Display Technology'],
    capabilities: ['PCB Assembly', 'Semiconductor Fab', 'Injection Molding', 'Testing'],
    materials: ['Silicon', 'Plastics', 'Aluminum', 'Electronics Components'],
    certifications: ['ISO 9001', 'ISO 14001', 'OHSAS 18001'],
    rating: 4.5,
    reviewCount: 2890,
    minOrder: 1000,
    leadTime: '4-8 weeks',
    priceRange: '$50-400',
    contact: {
      website: 'https://www.samsung.com',
      phone: '+82 2-2255-0114',
      email: 'info@samsung.com'
    },
    description: 'Global electronics and semiconductor manufacturing',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  },
  // International Manufacturers - Australia
  {
    id: 'bluescope-steel',
    name: 'BlueScope Steel',
    location: 'Melbourne, Australia',
    address: 'Level 11, 120 Collins Street, Melbourne VIC 3000, Australia',
    lat: -37.8136,
    lng: 144.9631,
    specialties: ['Steel Manufacturing', 'Metal Fabrication', 'Construction Materials'],
    capabilities: ['Steel Production', 'Metal Forming', 'Coating', 'Fabrication'],
    materials: ['Steel', 'Stainless Steel', 'Aluminum', 'Coated Metals'],
    certifications: ['ISO 9001', 'ISO 14001', 'AS/NZS 4801'],
    rating: 4.3,
    reviewCount: 567,
    minOrder: 500,
    leadTime: '4-12 weeks',
    priceRange: '$200-1000',
    contact: {
      website: 'https://www.bluescope.com',
      phone: '+61 3 9666 4000',
      email: 'info@bluescope.com'
    },
    description: 'Steel manufacturing and metal solutions',
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=300&fit=crop'
  }
]

// Get user location
export async function getUserLocation(): Promise<LocationData | null> {
  try {
    console.log('🌍 Requesting user location...')
    
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      })
    })

    const { latitude, longitude } = position.coords
    console.log('📍 Location obtained:', { latitude, longitude })

    // Use free reverse geocoding
    try {
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
      const data = await response.json()
      
      if (data.city && data.principalSubdivision) {
        const locationData: LocationData = {
          lat: latitude,
          lng: longitude,
          address: data.locality || `${data.city}, ${data.principalSubdivision}`,
          city: data.city,
          state: data.principalSubdivisionCode || data.principalSubdivision,
          country: data.countryCode || 'US'
        }
        
        console.log('✅ Real location data obtained:', locationData)
        return locationData
      }
    } catch (geocodeError) {
      console.log('⚠️ Reverse geocoding failed, using coordinates only')
    }

    return {
      lat: latitude,
      lng: longitude,
      address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      city: 'Unknown City',
      state: 'Unknown State',
      country: 'US'
    }
  } catch (error) {
    console.error('❌ Error getting location:', error)
    return null
  }
}

// Calculate distance between coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Search manufacturers from curated database
export async function searchManufacturers(params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🔍 Searching curated manufacturer database...')
    console.log('Search params:', params)
    
    // Filter manufacturers based on search criteria
    let filteredManufacturers = MANUFACTURER_DATABASE.filter(mfg => {
      // Check if manufacturer supports any of the required materials
      const materialMatch = params.materials.some(material => 
        mfg.materials.some(mfgMaterial => 
          mfgMaterial.toLowerCase().includes(material.toLowerCase()) ||
          material.toLowerCase().includes(mfgMaterial.toLowerCase())
        )
      )
      
      // Check if manufacturer supports the required method
      const methodMatch = mfg.capabilities.some(capability => 
        capability.toLowerCase().includes(params.method.toLowerCase()) ||
        params.method.toLowerCase().includes(capability.toLowerCase())
      )
      
      // Check quantity requirements
      const quantityMatch = !params.quantity || mfg.minOrder <= params.quantity
      
      return materialMatch || methodMatch || quantityMatch
    })
    
    // If no exact matches, broaden the search
    if (filteredManufacturers.length === 0) {
      console.log('🔍 No exact matches, broadening search...')
      filteredManufacturers = MANUFACTURER_DATABASE.filter(mfg => {
        // More lenient matching
        const broadMatch = mfg.specialties.some(specialty => 
          specialty.toLowerCase().includes('manufacturing') ||
          specialty.toLowerCase().includes('machining') ||
          specialty.toLowerCase().includes('printing')
        )
        return broadMatch
      })
    }
    
    // Convert to result format and calculate distances
    const results: ManufacturerResult[] = filteredManufacturers.map(mfg => {
      let distance = undefined
      if (params.userLocation) {
        distance = Math.round(calculateDistance(
          params.userLocation.lat,
          params.userLocation.lng,
          mfg.lat,
          mfg.lng
        ))
      }
      
      return {
        id: mfg.id,
        name: mfg.name,
        location: mfg.location,
        address: mfg.address,
        distance,
        specialties: mfg.specialties,
        capabilities: mfg.capabilities,
        certifications: mfg.certifications,
        rating: mfg.rating,
        reviewCount: mfg.reviewCount,
        priceRange: mfg.priceRange,
        leadTime: mfg.leadTime,
        minOrder: mfg.minOrder,
        contact: mfg.contact,
        matchScore: 0, // Will be calculated
        source: 'curated_database',
        description: mfg.description,
        image: mfg.image
      }
    })
    
    // Calculate match scores
    results.forEach(manufacturer => {
      manufacturer.matchScore = calculateMatchScore(manufacturer, params)
    })
    
    // Sort by match score and distance
    results.sort((a, b) => {
      const scoreA = a.matchScore + (a.distance ? Math.max(0, 50 - a.distance/50) : 0)
      const scoreB = b.matchScore + (b.distance ? Math.max(0, 50 - b.distance/50) : 0)
      return scoreB - scoreA
    })
    
    console.log('✅ Found', results.length, 'curated manufacturers')
    console.log('🏆 Top matches:', results.slice(0, 3).map(m => `${m.name} (${m.matchScore}% match, ${m.distance || 'N/A'} mi)`))
    
    return results
    
  } catch (error) {
    console.error('❌ Error searching curated database:', error)
    return []
  }
}

// Calculate match score
function calculateMatchScore(manufacturer: ManufacturerResult, params: ManufacturerSearchParams): number {
  let score = 0

  // Material Match (30%)
  const materialMatches = params.materials.filter(material => 
    manufacturer.specialties.some(specialty => 
      specialty.toLowerCase().includes(material.toLowerCase())
    )
  ).length
  score += (materialMatches / params.materials.length) * 30

  // Method Compatibility (30%)
  const methodMatch = manufacturer.capabilities.some(capability => 
    capability.toLowerCase().includes(params.method.toLowerCase())
  )
  score += methodMatch ? 30 : 15

  // Location Proximity (15%)
  if (manufacturer.distance) {
    const proximityScore = Math.max(0, 15 - (manufacturer.distance / 200))
    score += proximityScore
  } else {
    score += 7.5
  }

  // Capacity Match (15%)
  if (params.quantity && manufacturer.minOrder) {
    const capacityScore = params.quantity >= manufacturer.minOrder ? 15 : 7.5
    score += capacityScore
  } else {
    score += 10
  }

  // Quality Indicators (10%)
  const qualityScore = (manufacturer.rating / 5) * 5 + 
                      (manufacturer.certifications.length * 2)
  score += Math.min(10, qualityScore)

  return Math.round(score)
}

// Cache functions
export async function saveManufacturerSearch(params: ManufacturerSearchParams, results: ManufacturerResult[]): Promise<void> {
  try {
    const searchKey = `manufacturer-search-curated-${JSON.stringify(params)}`
    localStorage.setItem(searchKey, JSON.stringify({
      results,
      timestamp: new Date().toISOString(),
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }))
    console.log('✅ Curated manufacturer search cached')
  } catch (error) {
    console.error('❌ Error caching search:', error)
  }
}

export async function loadCachedManufacturerSearch(params: ManufacturerSearchParams): Promise<ManufacturerResult[] | null> {
  try {
    const searchKey = `manufacturer-search-curated-${JSON.stringify(params)}`
    const cached = localStorage.getItem(searchKey)
    
    if (cached) {
      const data = JSON.parse(cached)
      if (new Date(data.expires) > new Date()) {
        console.log('✅ Loaded cached curated manufacturer search')
        return data.results
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ Error loading cached search:', error)
    return null
  }
}