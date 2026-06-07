require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TabBar'
  s.version        = package['version']
  s.summary        = 'Custom floating tab bar for Rox'
  s.description    = 'A SwiftUI-based floating tab bar with expandable menu'
  s.license        = 'MIT'
  s.author         = 'Rox'
  s.homepage       = 'https://rox.one'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/nickroxsh/rox.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
