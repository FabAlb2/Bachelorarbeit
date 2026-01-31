package com.whs.bachelorarbeit.repository;

import com.whs.bachelorarbeit.dto.DoctorListItemDTO;
import com.whs.bachelorarbeit.entity.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DoctorRepository extends JpaRepository<Doctor, Long> {

        @Query("""
                select new com.whs.bachelorarbeit.dto.DoctorListItemDTO(
                    d.id,
                    d.name,
                    d.specialty,
                
                    f.id,
                      f.facilityName,
                      f.type,

                     f.street,
                     f.postalCode,
                     f.city,
                     f.phone,

                     f.latitude,
                     f.longitude,
                     f.wheelchairAccessible
                    )
                    from Doctor d
                    join d.facility f
                    order by d.lastName asc, d.firstName asc, d.name asc
                
                """)
        List<DoctorListItemDTO> findAllListItems();

    @Query("""
        select new com.whs.bachelorarbeit.dto.DoctorListItemDTO(
            d.id,
            d.name,
            d.specialty,

            f.id,
            f.facilityName,
            f.type,

            f.street,
            f.postalCode,
            f.city,
            f.phone,

            f.latitude,
            f.longitude,
            f.wheelchairAccessible
        )
        from Doctor d
        join d.facility f
        where d.id = :id
    """)
    Optional<DoctorListItemDTO> findListItemById(Long id);
}
